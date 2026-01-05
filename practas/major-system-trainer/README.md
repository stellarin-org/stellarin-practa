# Major System Trainer

Learn the Major System 00-99 with images and spaced repetition

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import MajorSystemTrainer from "@stellarin/practa-major-system-trainer";

function MyFlow() {
  return (
    <MajorSystemTrainer
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
      onSkip={() => console.log("Skipped")}
    />
  );
}
```

## Props

This component accepts the standard Practa props:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `context` | PractaContext | Yes | Flow context from previous Practa |
| `onComplete` | (output: PractaOutput) => void | Yes | Callback when the Practa completes |
| `onSkip` | () => void | No | Optional callback to skip the Practa |

## Author

Created by Stellarin

## Version

1.5.9
