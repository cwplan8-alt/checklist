import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { urlInputSchema } from "@shared/schema";
import { z } from "zod";
import { extractListsFromHTML, JSRenderedPageError } from "./parser";

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Process URL and extract checklist
  app.post("/api/process-url", async (req, res) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ message: "Too many requests. Please wait a minute before trying again." });
    }
    try {
      const { url } = urlInputSchema.parse(req.body);
      
      // Fetch the webpage content with timeout and size guard
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ListChecker/1.0)',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!response.ok) {
        return res.status(400).json({
          message: `Failed to fetch URL: ${response.status} ${response.statusText}`
        });
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "Page is too large to process (limit: 5MB)." });
      }

      const html = await response.text();
      if (html.length > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "Page content is too large to process (limit: 5MB)." });
      }
      const listItems = extractListsFromHTML(html, url);
      
      if (listItems.length === 0) {
        // Provide specific feedback for Fashion United
        if (url.includes('fashionunited.com') && url.includes('most-valuable-fashion-brands')) {
          return res.status(400).json({ 
            message: "Fashion United loads brand rankings dynamically with JavaScript, which can't be extracted from static HTML. The brand data isn't available in the initial page load. Try copying the list manually or finding an alternative rankings URL." 
          });
        }
        return res.status(400).json({ 
          message: "No lists found on this page. Please try a URL with numbered lists, bullet points, or step-by-step instructions." 
        });
      }
      
      // Extract title from HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
      
      // Create checklist
      const checklist = await storage.createChecklist({
        sourceUrl: url,
        title,
        totalItems: listItems.length,
        completedItems: 0,
      });
      
      // Create checklist items
      const items = listItems.map((text, index) => ({
        checklistId: checklist.id,
        text,
        isCompleted: false,
        order: index,
      }));
      
      await storage.createChecklistItems(items);
      
      // Return the complete checklist with items
      const checklistWithItems = await storage.getChecklist(checklist.id);
      res.json(checklistWithItems);
      
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }

      if (error instanceof JSRenderedPageError) {
        return res.status(400).json({
          message: "This page loads its content with JavaScript and can't be read server-side. Try a static page like a blog post, Wikipedia article, or recipe site."
        });
      }

      if (error?.name === 'AbortError') {
        return res.status(400).json({
          message: "The URL took too long to respond. Please try again or use a different URL."
        });
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return res.status(400).json({
          message: "Unable to access the URL. Please check that the URL is correct and accessible."
        });
      }

      console.error('Error processing URL:', error);
      res.status(500).json({
        message: "An error occurred while processing the URL. Please try again."
      });
    }
  });
  
  // Get checklist by ID (internal)
  app.get("/api/checklists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid checklist ID" });
      }

      const checklist = await storage.getChecklist(id);
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found" });
      }

      res.json(checklist);
    } catch (error) {
      console.error('Error fetching checklist:', error);
      res.status(500).json({ message: "An error occurred while fetching the checklist" });
    }
  });

  // Get checklist by share token (public permalink)
  app.get("/api/share/:token", async (req, res) => {
    try {
      const checklist = await storage.getChecklistByShareToken(req.params.token);
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      res.json(checklist);
    } catch (error) {
      console.error('Error fetching shared checklist:', error);
      res.status(500).json({ message: "An error occurred while fetching the checklist" });
    }
  });
  
  // Update checklist item status
  app.patch("/api/checklist-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isCompleted } = req.body;
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid item ID" });
      }
      
      if (typeof isCompleted !== 'boolean') {
        return res.status(400).json({ message: "isCompleted must be a boolean" });
      }
      
      const updatedItem = await storage.updateChecklistItem(id, isCompleted);
      if (!updatedItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      // Recount and persist checklist progress
      const checklistWithItems = await storage.getChecklist(updatedItem.checklistId);
      if (checklistWithItems) {
        const completedCount = checklistWithItems.items.filter(i => i.isCompleted).length;
        await storage.updateChecklistProgress(updatedItem.checklistId, completedCount);
      }

      res.json({ success: true });
      
    } catch (error) {
      console.error('Error updating checklist item:', error);
      res.status(500).json({ message: "An error occurred while updating the item" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}