# Typography Configuration

## Google Fonts Import

Add to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Or import in CSS:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

## Font Usage

### Headings: Inter
Used for all headings (h1-h6), navigation items, button text, and labels.

```css
font-family: 'Inter', sans-serif;
```

Weights used:
- **400** — Normal body text
- **500** — Medium emphasis, nav items
- **600** — Semibold, section titles
- **700** — Bold, page titles

### Body: Inter
Used for paragraph text, descriptions, and general content.

```css
font-family: 'Inter', sans-serif;
```

### Monospace: JetBrains Mono
Used for code, technical data (IP addresses, MAC addresses, ports), and the debug console.

```css
font-family: 'JetBrains Mono', monospace;
```

Weights used:
- **400** — Normal code text
- **500** — Medium emphasis code

## Tailwind Configuration

If using Tailwind CSS v4, fonts are configured in your CSS:

```css
@theme {
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

## Usage Examples

```html
<!-- Page title -->
<h1 class="font-sans font-bold text-2xl">Networks</h1>

<!-- Body text -->
<p class="font-sans text-base">Network description here.</p>

<!-- Technical data -->
<span class="font-mono text-sm">192.168.1.1</span>

<!-- Debug console -->
<pre class="font-mono text-xs">
  [10:23:01] Starting scan...
</pre>
```
