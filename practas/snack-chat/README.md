# SnackChat

A quick, fun tap-to-respond chat that guides you through bite-sized conversations

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import SnackChat from "@stellarin/practa-snack-chat";

function MyFlow() {
  return (
    <SnackChat
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

1.0.3
