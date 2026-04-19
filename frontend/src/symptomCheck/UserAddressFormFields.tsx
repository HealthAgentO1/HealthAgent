/**
 * Shared US address inputs for Symptom Check step 1 and Settings & profile.
 * Validation rules live in `addressValidation.ts`; blur behavior matches Symptom Check (errors after blur).
 */
import React from "react";
import type { UserAddress, UserAddressFieldErrors } from "./addressValidation";
import { US_STATE_OPTIONS, type UsStateCode } from "./usStates";

export type AddressFieldKey = "street" | "city" | "state" | "postalCode";

export const INITIAL_ADDRESS_BLURRED: Record<AddressFieldKey, boolean> = {
  street: false,
  city: false,
  state: false,
  postalCode: false,
};

export type UserAddressFormFieldsProps = {
  /** Prefix for DOM ids, e.g. `"addr"` → `addr-street`, `"settings-default"` → `settings-default-street`. */
  idPrefix: string;
  userAddress: UserAddress;
  setUserAddress: React.Dispatch<React.SetStateAction<UserAddress>>;
  addressFieldBlurred: Record<AddressFieldKey, boolean>;
  setAddressFieldBlurred: React.Dispatch<React.SetStateAction<Record<AddressFieldKey, boolean>>>;
  /** Legend content (required markers are added by this component when `showRequiredMarkers` is true). */
  legend: React.ReactNode;
  description?: React.ReactNode;
  showRequiredMarkers?: boolean;
  /** Called when the user edits any field (used to dismiss “autofilled” messaging on Symptom Check). */
  onUserEdit?: () => void;
  /** Optional class on the outer fieldset. */
  fieldsetClassName?: string;
  /** From `validateUserAddress(userAddress)` in the parent so rules stay in one place. */
  errors: UserAddressFieldErrors;
  /**
   * Renders on the same row as the ZIP input (end-aligned), e.g. Symptom Check “Save as default address”.
   * Omit on Settings where the ZIP row should stay full-width.
   */
  zipRowEnd?: React.ReactNode;
};

const inputClass =
  "w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner";

export const UserAddressFormFields: React.FC<UserAddressFormFieldsProps> = ({
  idPrefix,
  userAddress,
  setUserAddress,
  addressFieldBlurred,
  setAddressFieldBlurred,
  legend,
  description,
  showRequiredMarkers = true,
  onUserEdit,
  fieldsetClassName = "border-0 p-0 mx-0 mb-0",
  errors,
  zipRowEnd,
}) => {
  const markEdited = () => {
    onUserEdit?.();
  };

  const streetId = `${idPrefix}-street`;
  const cityId = `${idPrefix}-city`;
  const stateId = `${idPrefix}-state`;
  const zipId = `${idPrefix}-zip`;

  return (
    <fieldset className={fieldsetClassName}>
      <legend className="mb-2 block text-sm font-semibold text-on-surface">
        {legend}
        {showRequiredMarkers ? (
          <span className="text-error ml-1" aria-hidden>
            *
          </span>
        ) : null}
      </legend>
      {description ? (
        <p className="mb-4 font-body text-xs text-on-surface-variant">{description}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor={streetId}>
            Street address
            {showRequiredMarkers ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          <input
            aria-invalid={addressFieldBlurred.street && Boolean(errors.street)}
            autoComplete="street-address"
            className={inputClass}
            id={streetId}
            placeholder="123 Main St, Apt 4"
            type="text"
            value={userAddress.street}
            onBlur={() => setAddressFieldBlurred((prev) => ({ ...prev, street: true }))}
            onChange={(e) => {
              markEdited();
              setUserAddress((prev) => ({ ...prev, street: e.target.value }));
            }}
          />
          {addressFieldBlurred.street && errors.street ? (
            <p className="mt-1 font-body text-xs text-error" role="alert">
              {errors.street}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor={cityId}>
            City
            {showRequiredMarkers ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          <input
            aria-invalid={addressFieldBlurred.city && Boolean(errors.city)}
            autoComplete="address-level2"
            className={inputClass}
            id={cityId}
            placeholder="City"
            type="text"
            value={userAddress.city}
            onBlur={() => setAddressFieldBlurred((prev) => ({ ...prev, city: true }))}
            onChange={(e) => {
              markEdited();
              setUserAddress((prev) => ({ ...prev, city: e.target.value }));
            }}
          />
          {addressFieldBlurred.city && errors.city ? (
            <p className="mt-1 font-body text-xs text-error" role="alert">
              {errors.city}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor={stateId}>
            State
            {showRequiredMarkers ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          <select
            aria-invalid={addressFieldBlurred.state && Boolean(errors.state)}
            className={inputClass}
            id={stateId}
            value={userAddress.state}
            onBlur={() => setAddressFieldBlurred((prev) => ({ ...prev, state: true }))}
            onChange={(e) => {
              markEdited();
              setUserAddress((prev) => ({
                ...prev,
                state: e.target.value as UsStateCode | "",
              }));
            }}
          >
            <option value="">Select state</option>
            {US_STATE_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
          {addressFieldBlurred.state && errors.state ? (
            <p className="mt-1 font-body text-xs text-error" role="alert">
              {errors.state}
            </p>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor={zipId}>
            ZIP code
            {showRequiredMarkers ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          {zipRowEnd ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div className="min-w-0 sm:max-w-xs sm:flex-1">
                <input
                  aria-invalid={addressFieldBlurred.postalCode && Boolean(errors.postalCode)}
                  autoComplete="postal-code"
                  className={`${inputClass} w-full max-w-xs`}
                  id={zipId}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="12345"
                  type="text"
                  value={userAddress.postalCode}
                  onBlur={() =>
                    setAddressFieldBlurred((prev) => ({ ...prev, postalCode: true }))
                  }
                  onChange={(e) => {
                    markEdited();
                    const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                    setUserAddress((prev) => ({ ...prev, postalCode: v }));
                  }}
                />
                {addressFieldBlurred.postalCode && errors.postalCode ? (
                  <p className="mt-1 font-body text-xs text-error" role="alert">
                    {errors.postalCode}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">{zipRowEnd}</div>
            </div>
          ) : (
            <>
              <input
                aria-invalid={addressFieldBlurred.postalCode && Boolean(errors.postalCode)}
                autoComplete="postal-code"
                className={`${inputClass} max-w-xs`}
                id={zipId}
                inputMode="numeric"
                maxLength={5}
                placeholder="12345"
                type="text"
                value={userAddress.postalCode}
                onBlur={() =>
                  setAddressFieldBlurred((prev) => ({ ...prev, postalCode: true }))
                }
                onChange={(e) => {
                  markEdited();
                  const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setUserAddress((prev) => ({ ...prev, postalCode: v }));
                }}
              />
              {addressFieldBlurred.postalCode && errors.postalCode ? (
                <p className="mt-1 font-body text-xs text-error" role="alert">
                  {errors.postalCode}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </fieldset>
  );
};
