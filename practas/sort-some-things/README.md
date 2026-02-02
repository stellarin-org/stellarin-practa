# Sort Some Things

A gentle exercise to surface priorities and choose one place to begin

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import SortSomeThings from "@stellarin/practa-sort-some-things";

function MyFlow() {
  return (
    <SortSomeThings
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

Created by Practa Developer

## Version

1.4.4
