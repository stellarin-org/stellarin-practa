# Letter to Me

Write heartfelt letters to your future self, delivered when the time is right

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import LettertoMe from "@stellarin/practa-letter-to-me";

function MyFlow() {
  return (
    <LettertoMe
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

1.0.12
