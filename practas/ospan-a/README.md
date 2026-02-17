# Math & Memory (OSPAN)

Adaptive Operation Span training for working memory and executive control

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import MathMemoryOSPAN from "@stellarin/practa-ospan-a";

function MyFlow() {
  return (
    <MathMemoryOSPAN
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

Created by Practa

## Version

1.0.12
