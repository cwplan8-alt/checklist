# ListChecker - URL to Checklist Converter

## Overview

ListChecker is a full-stack web application that converts lists found on any webpage into interactive, checkable checklists. Users simply paste a URL containing a list (recipes, tutorials, instructions, etc.), and the application automatically extracts the list items and presents them as a clean, mobile-friendly checklist interface.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system and CSS variables
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Validation**: Zod schemas shared between client and server
- **Development**: Hot module replacement via Vite middleware

### Storage Strategy
- **Production**: PostgreSQL via Neon Database with connection pooling
- **Development**: In-memory storage implementation for rapid prototyping
- **ORM**: Drizzle ORM for type-safe database operations
- **Migrations**: Drizzle Kit for schema management

## Key Components

### Database Schema
- **checklists**: Stores checklist metadata (URL, title, progress tracking)
- **checklistItems**: Individual checklist items with completion status and ordering
- **Relationships**: One-to-many between checklists and items

### API Endpoints
- `POST /api/process-url`: Accepts URL, extracts lists, creates checklist
- `PATCH /api/checklist-items/:id`: Updates item completion status
- `GET /api/checklists/:id`: Retrieves checklist with items

### List Extraction Algorithm
- HTML parsing without external dependencies
- Multiple pattern matching strategies:
  - Ordered/unordered HTML lists (`<ol>`, `<ul>`)
  - Numbered text patterns (1. item, 2. item)
  - Bullet point patterns (•, -, * item)
  - Step-based patterns (Step 1: item)
- Content filtering (length validation, HTML tag removal)

### UI Components
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
- **Interactive Elements**: Real-time checkbox updates with optimistic UI
- **Progress Tracking**: Visual progress bars and completion statistics
- **Error Handling**: Comprehensive error states with retry mechanisms
- **Loading States**: Skeleton screens and progress indicators

## Data Flow

1. **URL Submission**: User submits URL via form with client-side validation
2. **Server Processing**: Express server fetches URL content and extracts lists
3. **Database Storage**: Checklist and items saved to PostgreSQL via Drizzle ORM
4. **Client Update**: React Query manages cache invalidation and UI updates
5. **Item Interactions**: Checkbox changes trigger optimistic updates and API calls
6. **State Synchronization**: Server state kept in sync with client via React Query

## External Dependencies

### Core Framework Dependencies
- React ecosystem (React, React DOM, React Hook Form)
- TanStack Query for data fetching and caching
- Express.js for server framework
- Drizzle ORM and Drizzle Kit for database operations

### UI and Styling
- Radix UI primitives for accessible components
- Tailwind CSS for utility-first styling
- Lucide React for consistent iconography
- Class Variance Authority for component variants

### Database and Infrastructure
- @neondatabase/serverless for PostgreSQL connection
- connect-pg-simple for session management
- Zod for runtime type validation

### Development Tools
- Vite for build tooling and development server
- TypeScript for type safety
- ESBuild for production bundling

## Deployment Strategy

### Build Process
1. **Client Build**: Vite compiles React app to static assets
2. **Server Build**: ESBuild bundles server code for Node.js
3. **Database**: Drizzle migrations applied to production database

### Environment Configuration
- `DATABASE_URL`: PostgreSQL connection string (required)
- `NODE_ENV`: Environment detection (development/production)
- Development: Vite dev server with HMR
- Production: Express serves compiled static assets

### Development Workflow
- Hot module replacement for React components
- TypeScript compilation checking
- Automatic server restart on backend changes
- Database schema syncing via Drizzle push

## Changelog
- June 30, 2025: Initial setup and MVP development
- July 1, 2025: Significantly improved list extraction algorithm
  - Added support for "01. Title (Director)" format (NYT film rankings)
  - Enhanced pattern matching for numbered lists with <br/> separators
  - Successfully extracts movie rankings from No Film School and similar sites
  - Prioritizes high-quality numbered content over navigation menus
  - Working perfectly for structured ranking lists
  - Fixed Blumhouse/Rotten Tomatoes extraction for "#1 to the side" format
  - Added URL-specific extraction priority for Rotten Tomatoes movie lists
  - Successfully extracts all ranked movies from complex layouts where numbers and titles are separate
  - Added BuzzFeed list extraction support for their specific HTML structure
  - Handles numbered lists with separate span elements for numbers and content
  - Added broad numbered pattern detection for general websites
  - Implemented multiple fallback extraction strategies for complex sites
  - Added table-based extraction for sites with tabular ranking data
  - Created comprehensive plain-text extraction as final fallback
  - Successfully implemented Fashion United brand rankings extraction
  - Added strict validation to filter out encoded/meaningless strings
  - Enhanced luxury brand recognition patterns for complex table structures

## User Preferences

Preferred communication style: Simple, everyday language.