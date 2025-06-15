# Clib Tube

A Chrome extension that allows you to clip YouTube Music songs and listen to the parts you enjoy most.

## Description

Clib Tube is a browser extension designed specifically for YouTube Music users who want to create custom clips of their favorite songs. Instead of listening to entire tracks, you can select and replay specific segments that you find most enjoyable.

## Features

- Works exclusively with YouTube Music
- Create custom clips from any song
- Simple popup interface for easy control
- Persistent storage for your clips

## Development

This project uses Vite for development and building, with TypeScript support and the CRX plugin for Chrome extension development.

### Prerequisites

- Node.js
- npm

### Installation

```bash
npm install
```

### Available Scripts

- `npm run dev` - Start the development server with hot reload
- `npm run build` - Build the extension for production
- `npm run preview` - Preview the built extension

### Project Structure

- `src/` - Source code
  - `popup/` - Extension popup interface
  - `content.ts` - Content script for YouTube Music integration
  - `types.ts` - TypeScript type definitions
- `images/` - Extension icons
- `manifest.json` - Chrome extension manifest
- `dist/` - Built extension files (generated)

### Loading the Extension

1. Run `npm run build` to build the extension
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` folder

## Usage

1. Navigate to YouTube Music
2. Click the extension icon in your browser toolbar
3. Use the popup interface to create and manage your song clips
4. Enjoy listening to your favorite parts on repeat!