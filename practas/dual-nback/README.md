# Dual N-Back

Train your working memory by tracking position and audio simultaneously with the Dual N-Back exercise

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import DualNBack from "@stellarin/practa-dual-nback";

function MyFlow() {
  return (
    <DualNBack
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

2.0.6
