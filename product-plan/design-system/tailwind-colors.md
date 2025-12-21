# Tailwind Color Configuration

## Color Choices

- **Primary:** `cyan` — Used for buttons, links, key accents, active states
- **Secondary:** `amber` — Used for warnings, highlights, secondary elements
- **Neutral:** `slate` — Used for backgrounds, text, borders

## Usage Examples

### Primary (Cyan)
```html
<!-- Primary button -->
<button class="bg-cyan-600 hover:bg-cyan-700 text-white">
  Start Scan
</button>

<!-- Primary link -->
<a class="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
  View Details
</a>

<!-- Active nav item -->
<div class="bg-cyan-600 text-white">
  Networks
</div>
```

### Secondary (Amber)
```html
<!-- Warning badge -->
<span class="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
  Unreachable
</span>

<!-- Warning message -->
<div class="border-amber-500 bg-amber-50 text-amber-700">
  Device offline
</div>
```

### Neutral (Slate)
```html
<!-- Text -->
<p class="text-slate-600 dark:text-slate-400">
  Description text
</p>

<!-- Background -->
<div class="bg-slate-50 dark:bg-slate-900">
  Content area
</div>

<!-- Border -->
<div class="border border-slate-200 dark:border-slate-700">
  Card
</div>

<!-- Sidebar -->
<aside class="bg-slate-800 text-slate-100">
  Navigation
</aside>
```

## Additional Colors Used

### Status Colors
- **Green:** Success, accessible, online (`green-500`, `green-600`)
- **Red:** Error, no credentials, danger (`red-500`, `red-600`)
- **Orange:** Moved device, warning (`orange-500`, `orange-600`)
- **Violet:** Bridge membership badges (`violet-500`, `violet-600`)
- **Blue:** VLAN badges (`blue-500`, `blue-600`)

### Role Badges
- **Admin:** `rose-100 text-rose-700` / `rose-900/30 text-rose-400`
- **User:** `slate-100 text-slate-700` / `slate-700 text-slate-300`

## Dark Mode

All components support dark mode using Tailwind's `dark:` variant. The application respects system preferences by default.

```html
<div class="bg-white dark:bg-slate-900">
  <p class="text-slate-900 dark:text-slate-100">
    Content adapts to theme
  </p>
</div>
```
