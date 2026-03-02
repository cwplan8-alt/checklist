import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { urlInputSchema, insertChecklistSchema, insertChecklistItemSchema } from "@shared/schema";
import { z } from "zod";

class JSRenderedPageError extends Error {
  constructor() {
    super('Page is JS-rendered');
    this.name = 'JSRenderedPageError';
  }
}

function extractJsonLdItems(html: string): string[] {
  const items: string[] = [];
  const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const raw = JSON.parse(match[1]);
      const entries: any[] = Array.isArray(raw) ? raw : [raw];
      for (const entry of entries) {
        if (entry['@type'] === 'ItemList' && Array.isArray(entry.itemListElement)) {
          for (const item of entry.itemListElement) {
            const name = item.name ?? item.item?.name;
            const pos = item.position;
            if (name && typeof name === 'string' && name.length > 2 && name.length < 200) {
              items.push(pos ? `${pos}. ${name}` : name);
            }
          }
        }
        if (entry['@type'] === 'HowTo' && Array.isArray(entry.step)) {
          for (const step of entry.step) {
            const text = step.text ?? step.name;
            if (text && typeof text === 'string') items.push(text.slice(0, 200));
          }
        }
      }
    } catch { /* skip invalid JSON */ }
  }
  return items;
}

// Helper function to validate content titles
function isValidContentTitle(title: string): boolean {
  // Must contain meaningful content
  if (title.length < 5 || title.length > 100) {
    return false;
  }
  
  // Should contain letters and possibly parentheses for years/info
  if (!/[A-Za-z]/.test(title)) {
    return false;
  }
  
  // Exclude navigation and UI elements
  const excludePatterns = [
    /^(menu|nav|header|footer|sidebar)/i,
    /^(login|signup|register|account)/i,
    /^(search|filter|sort|view)/i,
    /^(comment|reply|like|share)/i,
    /advertisement/i,
  ];
  
  return !excludePatterns.some(pattern => pattern.test(title));
}

// Helper function to validate list items
function isValidListItem(text: string): boolean {
  if (!text || text.length < 3 || text.length > 200) {
    return false;
  }
  
  // Filter out common non-list content
  const excludePatterns = [
    /^(scores|game|match|vs\.?|@)/i,
    /^(home|away|final|live)/i,
    /^(click|view|read|more|see)/i,
    /^(advertisement|sponsor|promo)/i,
    /^\d{1,2}:\d{2}/,  // Time patterns
    /^\d{1,2}\/\d{1,2}/,  // Date patterns
    /^(schedule|sync|teams|ballparks|players|pipeline|transactions)/i,
    /^(newsletter|app|store|auction)/i,
    /logo$/i,
    /^(subscribe|watch|help|center)/i,
    /^(longform|movies|reviews|trailers|features|video|shop|podcasts)/i,
    /^(visit us|share on|contact|advertise)/i,
    /^(facebook|twitter|instagram|youtube)/i,
    /^[a-zA-Z0-9]{15,}$/, // Long alphanumeric strings (likely encoded/hash values)
    /^[A-Z]{10,}$/, // Long all-caps strings
    /^[a-z]{10,}$/, // Long all-lowercase strings
    /[_]{2,}/, // Multiple underscores (variable names)
    /^\d+[a-zA-Z]+\d+[a-zA-Z]*\d*/, // Mixed number-letter patterns
    /^[^a-zA-Z\s]*$/, // No letters or spaces
  ];
  
  // Must contain actual readable words
  if (!/[a-zA-Z]{3,}/.test(text)) {
    return false;
  }
  
  // Check if it's mostly letters (at least 30% of characters should be letters)
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.length;
  if (letterCount / totalChars < 0.3) {
    return false;
  }
  
  return !excludePatterns.some(pattern => pattern.test(text));
}



// Simple HTML parsing without external dependencies
function extractListsFromHTML(html: string, url: string): string[] {
  // 1. Try JSON-LD structured data first (before stripping removes script content)
  const jsonLdItems = extractJsonLdItems(html);
  if (jsonLdItems.length >= 3) return jsonLdItems.slice(0, 100);

  const items: string[] = [];

  // Remove script and style tags
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 2. Try <ol>/<ul> list extraction — most reliable structural signal
  const structuredListItems: string[] = [];
  const listContainerPattern = /<(?:ol|ul)[^>]*>([\s\S]*?)<\/(?:ol|ul)>/gi;
  let listContainerMatch;
  while ((listContainerMatch = listContainerPattern.exec(cleanHtml)) !== null) {
    const listContent = listContainerMatch[1];
    const liItemPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liItemMatch;
    while ((liItemMatch = liItemPattern.exec(listContent)) !== null) {
      const text = liItemMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&[a-zA-Z0-9#]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (isValidListItem(text)) structuredListItems.push(text);
    }
  }
  if (structuredListItems.length >= 3) return structuredListItems.slice(0, 100);

  // 3. Detect JS-rendered pages: very little text after stripping = content loads via JS
  const strippedText = cleanHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const meaningfulWordCount = strippedText.split(/\s+/).filter(w => /[a-zA-Z]{4,}/.test(w)).length;
  if (meaningfulWordCount < 100) {
    throw new JSRenderedPageError();
  }

  // Try specific content extraction approaches first
  // Look for the specific pattern: "01. Title (Director)<br/>02. Title (Director)<br/>..." with HTML entity &amp; 
  const movieListPattern = /(\d{2})\.\s*([^<]*?(?:\([^)]+\))[^<]*?)(?:<br\s*\/?>)/gi;
  let numberedMatch;
  const tempItems: string[] = [];
  
  while ((numberedMatch = movieListPattern.exec(cleanHtml)) !== null) {
    const rank = numberedMatch[1];
    let title = numberedMatch[2].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
    
    // Filter out clearly non-content items and validate it looks like a movie title
    if (title && 
        title.length > 10 && 
        title.length < 200 && 
        title.includes('(') && title.includes(')') && // Must have parentheses (director names)
        !title.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back)/i)
       ) {
      tempItems.push(`${rank}. ${title}`);
    }
  }
  
  // If we found a good sequence of numbered movie items, use them and return early
  if (tempItems.length >= 20) {
    return tempItems.slice(0, 100); // Return the full movie list
  }
  
  // Try simple numbered list format (like BuzzFeed: "1. Title")
  // Look for patterns in paragraph or heading tags
  const simplePatterns = [
    /<h[1-6][^>]*>\s*(\d+)\.\s*([^<]+)<\/h[1-6]>/gi,
    /<p[^>]*>\s*(\d+)\.\s*([^<]+)<\/p>/gi,
    /<div[^>]*>\s*(\d+)\.\s*([^<]+)<\/div>/gi,
    // More general pattern for any tag containing numbered content
    /<[^>]+>\s*(\d+)\.\s*([^<]{20,})<\/[^>]+>/gi,
  ];
  
  const simpleTempItems: string[] = [];
  
  simplePatterns.forEach(pattern => {
    let simpleMatch;
    while ((simpleMatch = pattern.exec(cleanHtml)) !== null) {
      const rank = simpleMatch[1];
      let title = simpleMatch[2].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
      
      // Clean up the title by removing extra whitespace and line breaks
      title = title.replace(/\s+/g, ' ').trim();
      
      // Filter for meaningful content
      if (title && 
          title.length > 20 && 
          title.length < 300 && 
          !title.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share|community|quizzes|trending|celebrity|buzz|arcade|tv|movies)/i) &&
          !title.match(/^\d+$/) && // Not just numbers
          !title.match(/^[A-Z\s&]+$/) && // Not just capital letters
          title.includes(' ') // Must contain at least one space (proper sentences)
         ) {
        simpleTempItems.push(`${rank}. ${title}`);
      }
    }
  });
  
  // If we found a good sequence of simple numbered items, use them
  if (simpleTempItems.length >= 5) {
    return simpleTempItems.slice(0, 50);
  }
  
  // Look for numbered headings in articles (like "10. The Social Network")
  const headingPatterns = [
    /<h[1-6][^>]*>\s*(\d+)[\.\)]\s*([^<]+)/gi,
    /<p[^>]*>\s*<strong[^>]*>\s*(\d+)[\.\)]\s*([^<]+)<\/strong>/gi,
    /<div[^>]*>\s*(\d+)[\.\)]\s*<[^>]+>([^<]+)</gi,
    // Pattern for the specific ScreenCrush format
    /##\s*(\d+)[\.\)]\s*_([^_]+)_/gi,
  ];
  
  headingPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(cleanHtml)) !== null) {
      const rank = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      
      if (title && title.length > 5 && title.length < 100 && isValidContentTitle(title)) {
        items.push(`${rank}. ${title}`);
      }
    }
  });
  
  // Try to find content that contains numbered list text (for any site structure)
  // Look for sentences containing "1. " followed by meaningful text
  const broadPattern = /(\d+)\.\s+([^.\n]+(?:\.[^.\n]*)?)/gi;
  let broadMatch;
  const broadTempItems: string[] = [];
  
  while ((broadMatch = broadPattern.exec(cleanHtml)) !== null) {
    const rank = broadMatch[1];
    let title = broadMatch[2].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
    
    // Clean up the title
    title = title.replace(/\s+/g, ' ').trim();
    
    // Filter for actual content (not navigation)
    if (title && 
        title.length > 25 && 
        title.length < 400 && 
        !title.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share|community|quizzes|trending|celebrity|buzz|arcade|tv|movies|instagram|facebook|twitter|social|follow|like|subscribe)/i) &&
        !title.match(/^\d+$/) &&
        !title.match(/^[A-Z\s&]+$/) &&
        title.includes(' ') &&
        !title.includes('href') &&
        !title.includes('www.') &&
        !title.includes('http') &&
        // Look for content that sounds like list items
        (title.toLowerCase().includes('you') || 
         title.toLowerCase().includes('your') || 
         title.toLowerCase().includes('the') ||
         title.toLowerCase().includes('when') ||
         title.toLowerCase().includes('nothing') ||
         title.toLowerCase().includes('already'))
       ) {
      broadTempItems.push(`${rank}. ${title}`);
    }
  }
  
  // For BuzzFeed URLs, handle their specific list structure
  if (url.includes('buzzfeed.com')) {
    const buzzfeedItems: string[] = [];
    // BuzzFeed uses: <span class="subbuzz__number">1.</span> and <span class="js-subbuzz__title-text">Content</span>
    // Make the pattern more flexible to handle whitespace and HTML between elements
    const buzzfeedPattern = /<span[^>]*class="subbuzz__number"[^>]*>(\d+)\.<\/span>[\s\S]*?<span[^>]*class="js-subbuzz__title-text"[^>]*>([^<]+)<\/span>/gi;
    
    let buzzMatch;
    while ((buzzMatch = buzzfeedPattern.exec(cleanHtml)) !== null) {
      const number = buzzMatch[1];
      let title = buzzMatch[2].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
      
      if (title && title.length > 10 && title.length < 200) {
        buzzfeedItems.push(`${number}. ${title}`);
      }
    }
    
    // If the complex pattern didn't work, try a simpler approach
    if (buzzfeedItems.length === 0) {
      const titleOnlyPattern = /<span[^>]*class="js-subbuzz__title-text"[^>]*>([^<]+)<\/span>/gi;
      let titleMatch;
      let itemNumber = 1;
      
      while ((titleMatch = titleOnlyPattern.exec(cleanHtml)) !== null) {
        let title = titleMatch[1].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
        
        if (title && title.length > 10 && title.length < 200) {
          buzzfeedItems.push(`${itemNumber}. ${title}`);
          itemNumber++;
          if (itemNumber > 20) break; // Reasonable limit
        }
      }
    }
    
    if (buzzfeedItems.length >= 3) {
      return buzzfeedItems.slice(0, 50);
    }
  }

  // For Rotten Tomatoes URLs, prioritize movie-specific extraction first
  if (url.includes('rottentomatoes.com')) {
    // Try to extract Blumhouse-style rankings where numbers are separate from titles
    // Look for the specific Rotten Tomatoes movie links that appear in the ranking list
    const blumhouseMovies: string[] = [];
    const movieLinkPattern = /<a[^>]*href="https:\/\/www\.rottentomatoes\.com\/m\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
    
    let movieMatch;
    let movieRank = 1;
    
    while ((movieMatch = movieLinkPattern.exec(cleanHtml)) !== null) {
      const fullMatch = movieMatch[0]; // Get the full match including the <a> tag
      let title = movieMatch[1].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
      
      // Skip links with data-pageheader attribute (these are the [More] links)
      if (fullMatch.includes('data-pageheader')) {
        continue;
      }
      
      // Filter for valid movie titles - be strict to avoid navigation items
      if (title && 
          title.length > 2 && 
          title.length < 100 && 
          !title.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share|community|quizzes|trending|celebrity|buzz|arcade|tv|movies|login|register|subscribe|box office|dvd|news|horror|100 best|rt|rotten|tickets|showtimes|watch|trailers|photos|audience|critics|sign in|account|profile|about|contact|help|privacy|terms|copyright|advertise|careers|press|support)/i) &&
          /[a-zA-Z]/.test(title) &&
          !title.includes('www.') &&
          !title.includes('href') &&
          !title.includes('&amp;') &&
          // Filter out UI elements like [More], [Less], etc.
          !title.match(/^\s*\[.*\]\s*$/) &&
          !title.match(/^(more|less|show|hide|expand|collapse|toggle)$/i) &&
          !title.includes('[More]') &&
          !title.includes('[Less]') &&
          // Movie-like titles typically have certain characteristics
          (title.includes(' ') || title.length <= 15) // Either multi-word or short single word
         ) {
        blumhouseMovies.push(`${movieRank}. ${title}`);
        movieRank++;
        
        // Stop at a reasonable number to avoid over-extraction
        if (movieRank > 100) break;
      }
    }
    
    // If we found a good collection of movies, use them
    if (blumhouseMovies.length >= 10) {
      return blumhouseMovies;
    }
  }
  
  // Try broader numbered pattern extraction for any website
  const broadNumberedItems: string[] = [];
  
  // Look for any numbered patterns in text content - more flexible approach
  const flexibleNumberPattern = /(?:^|\n|\r|<[^>]*>|>)\s*(\d{1,2})[\.\)\:\s\-]*([A-Z][^<\n\r]{5,150})/gm;
  let flexMatch;
  
  while ((flexMatch = flexibleNumberPattern.exec(cleanHtml)) !== null) {
    const number = parseInt(flexMatch[1]);
    let content = flexMatch[2].replace(/<[^>]*>/g, '').replace(/&[a-zA-Z0-9]+;/g, '').trim();
    
    // Clean up content and validate with strict criteria
    if (content && 
        content.length > 10 && 
        content.length < 150 &&
        number <= 100 &&
        // Filter out encoded/hash-like strings
        !/^[a-zA-Z0-9]{15,}$/.test(content) &&
        !/^[A-Z]{10,}$/.test(content) &&
        !/^[a-z]{10,}$/.test(content) &&
        // Must have reasonable letter-to-total ratio (at least 50% letters)
        ((content.match(/[a-zA-Z]/g) || []).length / content.length) >= 0.5 &&
        // Should either have spaces (multi-word) or be a reasonable single word
        (/\s/.test(content) || content.length < 20) &&
        !content.match(/^(javascript|function|var |let |const |http|www\.|\.com|\.org)/i) &&
        !content.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share|community|trending)/i)
       ) {
      broadNumberedItems.push(`${number}. ${content}`);
    }
  }
  
  // If we found a good collection of numbered items, use them
  if (broadNumberedItems.length >= 3) {
    // Apply final strict validation to filter out encoded/meaningless strings
    const strictlyValidated = broadNumberedItems.filter(item => {
      const contentMatch = item.match(/^\d+[\.\)]\s+(.+)$/);
      const content = contentMatch ? contentMatch[1] : item;
      
      return !(
        /^[a-zA-Z0-9]{15,}$/.test(content) || // Long alphanumeric strings
        /^[A-Z]{10,}$/.test(content) || // Long all-caps strings
        /^[a-z]{10,}$/.test(content) || // Long all-lowercase strings
        content.includes('_') || // Likely variable names
        ((content.match(/[a-zA-Z]/g) || []).length / content.length) < 0.4 || // Less than 40% letters
        (!(/\s/.test(content)) && content.length > 20) // Long single words without spaces
      );
    });
    
    // Only return if we still have enough valid items after strict filtering
    if (strictlyValidated.length >= 3) {
      // Sort by number to ensure proper order
      strictlyValidated.sort((a, b) => {
        const numA = parseInt(a.split('.')[0]);
        const numB = parseInt(b.split('.')[0]);
        return numA - numB;
      });
      return strictlyValidated.slice(0, 50);
    }
  }

  // Try an even more aggressive approach for sites with complex structures
  const aggressiveItems: string[] = [];
  
  // Look for any text that contains both numbers and recognizable content patterns
  const aggressivePattern = /(\d{1,2})[\s\.\)\:\-]*([A-Za-z][A-Za-z\s&]{8,100})/g;
  let aggressiveMatch;
  
  while ((aggressiveMatch = aggressivePattern.exec(cleanHtml)) !== null) {
    const number = parseInt(aggressiveMatch[1]);
    let content = aggressiveMatch[2].replace(/<[^>]*>/g, '').replace(/&[a-zA-Z0-9]+;/g, '').trim();
    
    // Validate the content looks like a real list item with strict validation
    if (content && 
        content.length > 8 && 
        content.length < 100 &&
        number <= 50 &&
        // Must contain actual meaningful words (not code/IDs)
        /[A-Za-z]{3,}/.test(content) &&
        // Filter out encoded/hash-like strings
        !/^[a-zA-Z0-9]{15,}$/.test(content) &&
        !/^[A-Z]{10,}$/.test(content) &&
        !/^[a-z]{10,}$/.test(content) &&
        // Must have reasonable letter-to-total ratio (at least 50% letters)
        ((content.match(/[a-zA-Z]/g) || []).length / content.length) >= 0.5 &&
        // Should either have spaces (multi-word) or be a reasonable single word
        (/\s/.test(content) || content.length < 20) &&
        !content.match(/^(function|var |let |const |http|www\.|javascript|css|class|id|style)/i) &&
        !content.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share)/i) &&
        // Look for patterns that suggest brand names or list content
        (content.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/) || // "Louis Vuitton" pattern
         content.match(/^[A-Z][a-z]{3,}$/) || // "Nike" pattern
         content.length > 15) // Longer descriptions
       ) {
      aggressiveItems.push(`${number}. ${content}`);
    }
  }
  
  // Remove duplicates and sort
  const uniqueAggressive = Array.from(new Set(aggressiveItems));
  if (uniqueAggressive.length >= 3) {
    uniqueAggressive.sort((a, b) => {
      const numA = parseInt(a.split('.')[0]);
      const numB = parseInt(b.split('.')[0]);
      return numA - numB;
    });
    return uniqueAggressive.slice(0, 50);
  }

  // Try table-based extraction for sites like Fashion United
  const tableItems: string[] = [];
  
  // Look for table rows with ranking data - simplified approach
  const tableRowMatches = cleanHtml.split('<tr');
  
  for (const rowContent of tableRowMatches) {
    if (!rowContent.includes('</tr>')) continue;
    
    const fullRow = '<tr' + rowContent.split('</tr>')[0] + '</tr>';
    
    // Extract cell content from table rows
    const cellMatches = fullRow.split('<td');
    const cells: string[] = [];
    
    for (const cellContent of cellMatches) {
      if (!cellContent.includes('</td>')) continue;
      
      const cellText = cellContent.split('</td>')[0]
        .replace(/^[^>]*>/, '') // Remove opening tag attributes
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&[a-zA-Z0-9]+;/g, '') // Remove HTML entities
        .trim();
      
      if (cellText) {
        cells.push(cellText);
      }
    }
    
    // Check if this looks like a ranking row: [number, name, value]
    if (cells.length >= 2) {
      const firstCell = cells[0].trim();
      const secondCell = cells[1].trim();
      
      // Check if first cell is a number and second cell is a brand name
      if (/^\d{1,2}$/.test(firstCell) && 
          secondCell.length > 2 && 
          secondCell.length < 50 &&
          /^[A-Z]/.test(secondCell) &&
          !secondCell.match(/^(Name|Brand|Value|Rank|#)/i)) {
        const rankNumber = parseInt(firstCell);
        if (rankNumber <= 50) {
          tableItems.push(`${rankNumber}. ${secondCell}`);
        }
      }
    }
  }
  
  // Also try a more flexible table pattern for complex structures
  if (tableItems.length < 3) {
    // Look for patterns like "1\tLouis Vuitton\t$41.6B" in text content
    const tabularPattern = /(\d{1,2})\s*[\t\s]+([A-Z][A-Za-z\s&]{3,40})\s*[\t\s]+[\$€£¥]?[\d,\.]+[BMKbmk]?/g;
    let tabMatch;
    
    while ((tabMatch = tabularPattern.exec(cleanHtml)) !== null) {
      const number = parseInt(tabMatch[1]);
      const content = tabMatch[2].trim();
      
      if (number <= 50 && content.length > 2 && content.length < 50) {
        tableItems.push(`${number}. ${content}`);
      }
    }
    
    // Try an even simpler pattern for "number brand_name" combinations
    if (tableItems.length < 3) {
      const simpleBrandPattern = /(\d{1,2})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[\$€£¥]/g;
      let brandMatch;
      
      while ((brandMatch = simpleBrandPattern.exec(cleanHtml)) !== null) {
        const number = parseInt(brandMatch[1]);
        const brandName = brandMatch[2].trim();
        
        if (number <= 50 && 
            brandName.length > 2 && 
            brandName.length < 40 &&
            // Make sure it looks like a brand name
            /^[A-Z]/.test(brandName) &&
            !brandName.match(/^(Name|Brand|Value|Rank|#|The|A|An|In|Of|For|With|And|Or|But)/i)) {
          tableItems.push(`${number}. ${brandName}`);
        }
      }
    }
    
    // Try to find specific luxury brand patterns if nothing else worked
    if (tableItems.length < 3) {
      const luxuryBrands = ['Louis Vuitton', 'Nike', 'Chanel', 'Gucci', 'Hermès', 'Dior', 'Cartier', 'Burberry', 'Prada', 'Fendi'];
      
      for (const brand of luxuryBrands) {
        // Look for this brand name with a preceding number
        const brandPattern = new RegExp(`(\\d{1,2})\\s+${brand.replace(/\s+/g, '\\s+')}`, 'g');
        const match = brandPattern.exec(cleanHtml);
        
        if (match) {
          const number = parseInt(match[1]);
          if (number <= 50) {
            tableItems.push(`${number}. ${brand}`);
          }
        }
      }
    }
    
    // Last resort: try to extract any text that contains numbers followed by recognizable brand names
    if (tableItems.length < 3) {
      // First, try to find JSON data in script tags that might contain the brand information
      const scriptMatches = cleanHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
      
      for (const script of scriptMatches) {
        // Look for JSON objects that might contain brand data
        const jsonMatches = script.match(/\{[\s\S]*?\}/g) || [];
        
        for (const jsonString of jsonMatches) {
          try {
            // Try to find brand names in JSON data
            if (jsonString.includes('Louis Vuitton') || jsonString.includes('Nike') || jsonString.includes('Chanel')) {
              // Extract brand names with rankings from JSON-like structures
              const brandInJsonPattern = /["']?(\d{1,2})["']?\s*:\s*["']([^"']+)["']/g;
              let jsonMatch;
              
              while ((jsonMatch = brandInJsonPattern.exec(jsonString)) !== null) {
                const number = parseInt(jsonMatch[1]);
                const content = jsonMatch[2].trim();
                
                if (number <= 50 && content.length > 3 && content.length < 50) {
                  tableItems.push(`${number}. ${content}`);
                }
              }
            }
          } catch (e) {
            // Continue if JSON parsing fails
          }
        }
      }
      
      // If still no results, try plain text extraction
      if (tableItems.length < 3) {
        // Remove all HTML and just work with plain text
        const plainText = cleanHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-zA-Z0-9]+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Look for number followed by capitalized words that could be brand names
        const textBrandPattern = /(\d{1,2})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
        let textMatch;
        
        while ((textMatch = textBrandPattern.exec(plainText)) !== null) {
          const number = parseInt(textMatch[1]);
          const brandName = textMatch[2].trim();
          
          if (number <= 50 && 
              brandName.length > 3 && 
              brandName.length < 40 &&
              // Filter out common non-brand words
              !brandName.match(/^(Name|Brand|Value|Rank|Most|Best|Top|List|Number|The|This|That|When|Where|What|How|Why|Who|Which|All|Any|Some|More|Less|New|Old|Big|Small|Good|Bad|First|Last|Next|Previous|Other|Same|Different|Many|Few|Several|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i) &&
              // Must start with capital letter
              /^[A-Z]/.test(brandName)) {
            tableItems.push(`${number}. ${brandName}`);
          }
        }
      }
    }
  }
  
  if (tableItems.length >= 3) {
    // Remove duplicates and sort
    const uniqueTable = Array.from(new Set(tableItems));
    uniqueTable.sort((a, b) => {
      const numA = parseInt(a.split('.')[0]);
      const numB = parseInt(b.split('.')[0]);
      return numA - numB;
    });
    return uniqueTable.slice(0, 50);
  }

  // If we found meaningful broad content, use it
  if (broadTempItems.length >= 3) {
    return broadTempItems.slice(0, 50);
  }
  
  // Try to extract ranked movie lists from sites like Rotten Tomatoes
  // Look for the specific structure: <a class='title' href='...'>Movie Title</a>
  const rottentomatoesPattern = /<a[^>]*class=['"]title['"][^>]*>([^<]+)<\/a>/gi;
  let rtMatch;
  const rtTempItems: string[] = [];
  let rtRank = 1;
  
  while ((rtMatch = rottentomatoesPattern.exec(cleanHtml)) !== null) {
    let title = rtMatch[1].replace(/&amp;/g, '&').replace(/<[^>]*>/g, '').trim();
    
    // Filter for valid movie titles - be more specific to RT navigation content
    if (title && 
        title.length > 2 && 
        title.length < 100 && 
        !title.match(/^(search|menu|nav|log|sign|click|view|read|more|see|next|previous|home|back|@|share|community|quizzes|trending|celebrity|buzz|arcade|tv|movies|login|register|subscribe|box office|dvd|news|horror|100 best|rt|rotten|tickets|showtimes|watch|trailers|photos|audience|critics)/i) &&
        !title.match(/^\d+\s*$/) && // Not just numbers
        !title.includes('href') &&
        !title.includes('www.') &&
        // Looks like a movie title (contains letters and possibly common movie words)
        /[a-zA-Z]/.test(title)
       ) {
      rtTempItems.push(`${rtRank}. ${title}`);
      rtRank++;
    }
  }
  
  // If we found a good collection of movie titles, use them
  if (rtTempItems.length >= 10) {
    return rtTempItems.slice(0, 100);
  }
  
  // Then try standard list extraction
  const patterns = [
    // Ordered lists
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    // Unordered lists
    /<ul[^>]*>([\s\S]*?)<\/ul>/gi,
    // Numbered patterns in text - improved to be more specific
    /(?:^|\n)\s*(\d+)[\.\)]\s+([^\n\r]+)/gm,
    // Bullet point patterns
    /(?:^|\n)\s*[•\-\*]\s+([^\n\r]+)/gm,
    // Step patterns
    /step\s+\d+[:\-\s]+([^\n\r]+)/gi,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(cleanHtml)) !== null) {
      if (pattern.source.includes('ol>') || pattern.source.includes('ul>')) {
        // Extract li items from lists
        const listContent = match[1];
        const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liPattern.exec(listContent)) !== null) {
          const text = liMatch[1].replace(/<[^>]*>/g, '').trim();
          if (isValidListItem(text)) {
            items.push(text);
          }
        }
      } else {
        // Direct text matches - use index 2 for numbered patterns (group 2), index 1 for others
        const textIndex = pattern.source.includes('\\d+') ? 2 : 1;
        const text = match[textIndex]?.replace(/<[^>]*>/g, '').trim();
        if (text && isValidListItem(text)) {
          items.push(text);
        }
      }
    }
  });
  
  // Remove duplicates and return, prioritizing items that start with numbers
  const uniqueItemsSet = new Set(items);
  const uniqueItems: string[] = [];
  uniqueItemsSet.forEach(item => uniqueItems.push(item));
  
  // Apply final strict validation to filter out encoded/meaningless strings
  const finalValidatedItems = uniqueItems.filter(item => {
    // For numbered items, extract just the content part for validation
    const contentMatch = item.match(/^\d+[\.\)]\s+(.+)$/);
    const content = contentMatch ? contentMatch[1] : item;
    
    // Apply strict validation to the content
    return !(
      /^[a-zA-Z0-9]{15,}$/.test(content) || // Long alphanumeric strings
      /^[A-Z]{10,}$/.test(content) || // Long all-caps strings
      /^[a-z]{10,}$/.test(content) || // Long all-lowercase strings
      content.includes('_') || // Likely variable names
      ((content.match(/[a-zA-Z]/g) || []).length / content.length) < 0.4 || // Less than 40% letters
      (!(/\s/.test(content)) && content.length > 20) // Long single words without spaces
    );
  });
  
  const numberedItems = finalValidatedItems.filter(item => /^\d+[\.\)]\s/.test(item));
  const otherItems = finalValidatedItems.filter(item => !/^\d+[\.\)]\s/.test(item));
  
  return [...numberedItems, ...otherItems].slice(0, 50); // Limit to 50 items
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Process URL and extract checklist
  app.post("/api/process-url", async (req, res) => {
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
  
  // Get checklist by ID
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