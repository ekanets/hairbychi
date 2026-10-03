import { useState } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "../ui/Button";
import { errorMessage } from "../lib/errors";

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: { fontSize: "16px", color: "#1c1917", "::placeholder": { color: "#a8a29e" } },
  },
};

function InnerForm({
  clientSecret,
  onReady,
  disabled,
}: {
  clientSecret: string;
  onReady: (setupIntentId: string) => void;
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    setSubmitting(false);
    if (result.error) {
      setError(errorMessage("card_verification_failed", result.error.message));
      return;
    }
    if (result.setupIntent?.status === "succeeded") {
      setConfirmed(true);
      onReady(result.setupIntent.id);
    } else {
      setError(errorMessage("card_verification_failed"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
      {confirmed ? (
        <p className="text-sm font-medium text-success">Card saved. Nothing has been charged.</p>
      ) : (
        <Button type="button" onClick={handleConfirm} disabled={!stripe || submitting || disabled}>
          {submitting ? "Verifying card…" : "Save card"}
        </Button>
      )}
    </div>
  );
}

export default function StripeCardForm({
  clientSecret,
  onReady,
  disabled,
}: {
  clientSecret: string | null;
  onReady: (setupIntentId: string) => void;
  disabled?: boolean;
}) {
  if (!stripePromise) {
    return (
      <p className="rounded-2xl border border-dashed border-sand-deep bg-cream px-4 py-3 text-sm text-muted">
        Card verification isn't configured in this environment.
      </p>
    );
  }
  if (!clientSecret) return null;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <InnerForm clientSecret={clientSecret} onReady={onReady} disabled={disabled} />
    </Elements>
  );
}
