# Toasty Task Logo Styling Guide

## Current Logo Variant: CSS Filled

The **`toasty_task_filled_css-v2.svg`** is our primary logo variant, now in use across the application header and favicon.

### Key Features

- **Single compound path** for unified styling
- **CSS variable support** via `--toast`, `--check`, and `--bg` variables for dynamic color control
- **Theme-aware**: Automatically inherits foreground color from current theme
- **Transparent background**: Seamlessly integrates with any background
- **Optimized**: Vectorized with minimal file size (~17KB)

### Implementation

#### In Header (React/JSX)

```tsx
<svg
  viewBox="0 0 1024 1024"
  width={40}
  height={40}
  className="h-10 w-10"
  style={{
    "--bg": "transparent",
    "--toast": "var(--foreground)",
    "--check": "var(--foreground)",
  } as React.CSSProperties & Record<string, string>}
>
  <style>{`
    svg {
      --bg: transparent;
      --toast: #f24c05;
      --check: #f24c05;
    }
  `}</style>
  <rect width="100%" height="100%" fill="var(--bg)" />
  <g id="toast" fill="var(--toast)">
    <path d="[toast path data]" />
  </g>
  <path id="check" d="[check path data]" fill="var(--check)" />
</svg>
```

**Key points:**
- Set `--toast` and `--check` to `var(--foreground)` so both fills follow the current theme
- The `<style>` block defines default CSS variables as fallbacks in case CSS overrides fail
- `fillRule="evenodd"` ensures proper fill rendering for complex paths (still relevant if the SVG uses compound paths instead of grouped ones)

#### In Favicon (Next.js)

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  icons: {
    icon: [
      {
        url: "/toasty_task_filled_css-v2.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
    shortcut: [
      {
        url: "/toasty_task_filled_css-v2.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
  },
};
```

### CSS Variable Usage

| Variable | Default | Purpose |
|----------|---------|---------|
| `--bg` | `transparent` | Background fill—defaults to transparent but can be customized to any color (e.g., `#ffffff`, `rgba(0,0,0,0.1)`) |
| `--toast` | `#f24c05` | Toast icon fill (envelope body) |
| `--check` | `#f24c05` | Check mark and accent fill inside the grouped path |
| `--line` | `#f24c05` | Legacy alias for single-path logos; use when a file exposes only one `line` class |

#### Customizing the Background

To add a background color, override the `--bg` variable:

```tsx
<svg
  style={{
    "--bg": "#ffffff",        // White background
    "--toast": "var(--foreground)",
    "--check": "var(--foreground)",
  } as React.CSSProperties & Record<string, string>}
>
  {/* ... */}
</svg>
```

Or in CSS:
```css
svg {
  --bg: #f0f0f0;  /* Light gray background */
  --toast: #f24c05; /* Toast fill */
  --check: #f24c05; /* Check fill */
}
```

### Light/Dark Mode Colors

The logo automatically respects the system's `prefers-color-scheme` preference:

  - **Light mode**: Maps `--toast`, `--check`, and the legacy `--line` to `--foreground` (typically #1b1b1b or dark gray)
  - **Dark mode**: Maps the same variables to `--foreground` (typically #E8E4D8 or light beige)

No additional CSS is needed—the theme system handles this automatically.

### When to Use Each Variant

| Logo | Use Case | File |
|------|----------|------|
| **CSS Filled** | Header, favicon, primary branding | `toasty_task_filled_css-v2.svg` |
| **CSS Stroked** | Alternate designs, custom stroke control | `toasty_task_logo_css_stroked_split_widths.svg` |
| **Original Filled** | Legacy support (uses drop-shadow filter) | `toasty_task_logo_vectorized_filled.svg` |

### Demo Page

View all logo variants and compare them at `/logo-demo` to see the CSS variables in action.
