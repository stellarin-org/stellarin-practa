# Six

A daily word guessing game - guess the 6-letter word in 6 tries

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import Six from "@stellarin/practa-six";

function MyFlow() {
  return (
    <Six
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

Created by Woodenfox

## Version

1.7.9
