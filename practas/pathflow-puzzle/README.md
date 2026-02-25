# Pathflow

A calming path puzzle where you connect numbers in order by filling every square. Draw your way to flow.

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import Pathflow from "@stellarin/practa-pathflow-puzzle";

function MyFlow() {
  return (
    <Pathflow
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

1.1.0
