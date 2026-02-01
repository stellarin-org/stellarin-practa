# Letter to Future Self

Write heartfelt letters to your future self, delivered when the time is right

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import LettertoFutureSelf from "@stellarin/practa-letter-to-future-self";

function MyFlow() {
  return (
    <LettertoFutureSelf
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

Created by Woodenfox

## Version

1.0.0
