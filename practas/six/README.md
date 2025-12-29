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

Created by Your Name

## Version

1.1.3
