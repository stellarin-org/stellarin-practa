# Practa Splash Screen System

This document explains how splash screens work in the Practa framework, including setup, animation timing, and best practices.

## Overview

When a Practa starts, the framework can display a full-screen splash image with a smooth fade animation before revealing the main content. This creates a polished transition experience for users.

## How to Add a Splash Screen

### 1. Add the splash image to your assets folder

Place your splash image in your Practa's `assets/` directory:

```
client/my-practa/
  assets/
    splash.png    ← Your splash image
  index.tsx
  metadata.json
```

### 2. Declare it in metadata.json

Add `splash` to your assets declaration:

```json
{
  "id": "my-practa",
  "name": "My Practa",
  "version": "1.0.0",
  "description": "A calming experience",
  "author": "Your Name",
  "assets": {
    "splash": "splash.png"
  }
}
```

The key must be exactly `"splash"` for the framework to recognize it as a splash screen asset.

### 3. That's it!

The framework automatically detects and displays the splash screen when your Practa starts.

## Animation Timing

The splash screen follows this animation sequence:

| Phase | Duration | Description |
|-------|----------|-------------|
| Overlay fade-in | 300ms | White overlay fades in |
| Image fade-in | 400ms | Splash image fades in over overlay |
| Display | 2000ms | Image stays visible (fixed duration) |
| Image fade-out | 400ms | Splash image fades out |
| Overlay fade-out | 400ms | White overlay fades out, revealing content |

**Total animation time:** ~3.5 seconds

### Timing Diagram

```
Time (ms):  0    300    700         2700   3100   3500
            │     │      │           │      │      │
Overlay:    ░░░░░█████████████████████████████░░░░░
Image:            ░░░░░████████████████░░░░░
                  └─ fade in         └─ fade out
```

## How It Works Internally

### Asset Resolution

1. **Development (Replit):** The framework uses Metro bundler's `require()` to load splash images from the assets folder.

2. **Production (Stellarin):** Splash images are served via CDN URLs provided through `context.assets`.

### Detection Flow

```
FlowScreen mounts
    ↓
hasSplash(practaId) checks if "splash" key exists in asset registry
    ↓
If true: getSplashSource() returns the image source
    ↓
PractaSplashScreen renders with the splash image
    ↓
After animation completes: onComplete() callback hides splash
    ↓
Main Practa content becomes visible
```

### Overlay Behavior

The splash screen uses a `startWithOverlay` prop that determines initial state:

- **When navigating to a Practa:** The overlay fades in from transparent (300ms), then the image appears
- **When transitioning between Practa in a flow:** The overlay may already be visible, creating a seamless transition between splash screens

### Key Files

| File | Purpose |
|------|---------|
| `client/components/PractaSplashScreen.tsx` | Splash animation component |
| `client/lib/practa-assets.ts` | Asset resolution and splash detection |
| `client/screens/FlowScreen.tsx` | Orchestrates splash → content transition |

## Image Requirements

### Recommended Specifications

| Property | Recommendation |
|----------|----------------|
| Format | PNG (preferred) or JPG |
| Dimensions | 1242 x 2688 pixels (iPhone 14 Pro Max) |
| Aspect ratio | 9:19.5 (full screen portrait) |
| File size | Under 500KB for fast loading |
| Color mode | sRGB |

### Safe Areas

Design your splash with safe areas in mind:
- **Top:** 47px for status bar / dynamic island
- **Bottom:** 34px for home indicator
- Keep important content in the center safe zone

```
┌─────────────────────┐
│    Status Bar       │ ← 47px
├─────────────────────┤
│                     │
│                     │
│    SAFE ZONE        │
│    Place key        │
│    content here     │
│                     │
│                     │
├─────────────────────┤
│   Home Indicator    │ ← 34px
└─────────────────────┘
```

## Best Practices

### Do

- **Use high-quality imagery** that reflects your Practa's theme
- **Keep it simple** - a single focal point works best
- **Match your brand colors** with the Practa's main UI
- **Test on multiple screen sizes** to ensure proper display
- **Optimize image file size** for fast loading

### Don't

- **Avoid text** - it may be cut off on different devices
- **Don't use complex animations** - the splash is a static image
- **Avoid pure white backgrounds** - they blend with the overlay
- **Don't make it too busy** - users only see it briefly

## Fallback Behavior

If the splash image fails to load within 5 seconds, the framework automatically skips the splash and shows the main content. This prevents users from being stuck on a broken splash screen.

```typescript
// From PractaSplashScreen.tsx
useEffect(() => {
  const timeout = setTimeout(() => {
    if (!imageLoaded) {
      console.warn("[PractaSplash] Image failed to load, skipping");
      onComplete();
    }
  }, 5000);
  return () => clearTimeout(timeout);
}, [imageLoaded, onComplete]);
```

## Example: Adding a Splash to Your Practa

### 1. Create or obtain your splash image

Generate using an image tool or design one yourself.

### 2. Save to assets folder

```
client/my-practa/assets/splash.png
```

### 3. Update metadata.json

```json
{
  "id": "my-practa",
  "name": "Morning Mindfulness",
  "version": "1.0.0",
  "description": "Start your day with intention",
  "author": "Your Name",
  "estimatedDuration": 180,
  "category": "wellness",
  "assets": {
    "splash": "splash.png"
  }
}
```

### 4. Test in the app

Run your Practa from the Dev screen to see the splash animation.

## Accessing Splash in Your Component

While the framework handles splash display automatically, you can also access the splash asset in your component if needed:

```tsx
export default function MyPracta({ context, onComplete }: PractaComponentProps) {
  // Access the splash image (if declared)
  const splashImage = context.assets?.splash;
  
  // Use it elsewhere in your component if needed
  return (
    <View>
      {splashImage ? (
        <Image source={splashImage} style={styles.backgroundImage} />
      ) : null}
      {/* ... rest of your Practa */}
    </View>
  );
}
```

## Troubleshooting

### Splash not showing

1. Verify the asset key is exactly `"splash"` in metadata.json
2. Check that the image file exists in the assets folder
3. Ensure the filename matches what's declared in metadata.json
4. Restart the dev server after adding new assets

### Image looks stretched or cropped

- Use the recommended 9:19.5 aspect ratio
- Design for the largest screen size, then let `contentFit="cover"` handle scaling
- Keep important content centered in the safe zone

### Animation feels too fast/slow

The display duration is fixed at 2 seconds and cannot be customized per-Practa. This timing is optimized for a pleasant user experience that's long enough to absorb the imagery but short enough not to delay the user.
