# My Practa

A starter template for creating custom wellbeing experiences for Stellarin.

## Description

This Practa provides a simple interactive experience with a welcome screen and completion flow. Use it as a starting point to build your own custom wellbeing experience.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `context` | `PractaContext` | Yes | Context from previous Practa in the flow |
| `onComplete` | `(output: PractaOutput) => void` | Yes | Callback when the experience is finished |
| `onSkip` | `() => void` | No | Optional callback to skip the experience |

## Usage

The component receives context from the flow system and calls `onComplete` when the user finishes the experience.

```tsx
<MyPracta
  context={{ flowId: "flow-123", practaIndex: 0 }}
  onComplete={(output) => console.log("Completed:", output)}
  onSkip={() => console.log("Skipped")}
/>
```

## Output

When completed, this Practa outputs:
- `content.type`: "text"
- `content.value`: "Practa completed successfully!"
- `metadata.completedAt`: Timestamp of completion
