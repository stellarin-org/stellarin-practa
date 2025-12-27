# Hello World

A simple interactive Practa that counts taps

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import HelloWorld from "@stellarin/practa-hello-world";

function MyFlow() {
  return (
    <HelloWorld
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

1.0.1
