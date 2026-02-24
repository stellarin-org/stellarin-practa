# Doubbling

A focus-building number puzzle where you swipe to merge tiles and reach the target number. Choose your difficulty for a quick relaxer or a strategic challenge.

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import Doubbling from "@stellarin/practa-doubbling";

function MyFlow() {
  return (
    <Doubbling
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

Created by Stellarin

## Version

1.0.5
