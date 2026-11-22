# Toast notification timing

Routine success and information notifications dismiss after four seconds. This
is a balanced default for short status messages: it avoids a persistent stack
of stale notifications while allowing readers time to notice a concise update.
Errors use an interruptive announcement and, like every toast, include a
visible dismiss control.

The implementation is reviewed against [WCAG 2.2 success criterion 2.2.1,
Timing Adjustable](https://www.w3.org/TR/WCAG22/#timing-adjustable). The
dismiss button lets a person control a toast instead of requiring the timer to
be their only interaction path.

## Usability validation protocol

Before changing this duration, test the proposed value with keyboard-only and
screen-reader users, including slow readers. Record whether each participant
can identify the message and dismiss it without time pressure. Retain four
seconds unless that testing identifies a clearer default; action-required
messages should use a persistent UI rather than relying on an auto-dismissing
toast.
