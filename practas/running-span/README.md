# Running Span

A scientifically-validated working memory assessment. Watch an unpredictable sequence and recall the last N items in order.

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import RunningSpan from "@stellarin/practa-running-span";

function MyFlow() {
  return (
    <RunningSpan
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
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

## Author

Created by Your Name

## Version

1.0.11
