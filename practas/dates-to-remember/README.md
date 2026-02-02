# Dates to Remember

Never forget an important date

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import DatestoRemember from "@stellarin/practa-dates-to-remember";

function MyFlow() {
  return (
    <DatestoRemember
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

Created by Mike Messenger

## Version

1.7.7
