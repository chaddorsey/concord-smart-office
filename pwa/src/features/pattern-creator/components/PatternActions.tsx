/**
 * Pattern Actions Component
 *
 * Action buttons for the pattern creator: Save, Submit to Queue, Reset.
 * Includes confirmation dialogs and loading states.
 */

import React, { useState, useCallback } from 'react';

interface PatternActionsProps {
  /** Callback when Save is clicked */
  onSave?: () => Promise<void> | void;
  /** Callback when Submit to Queue is clicked */
  onSubmit?: () => Promise<void> | void;
  /** Callback when Reset is clicked */
  onReset?: () => void;
  /** Whether save is available */
  canSave?: boolean;
  /** Whether submit is available */
  canSubmit?: boolean;
  /** Estimated draw time to show */
  estimatedTime?: number;
  /** Pattern name for display */
  patternName?: string;
  /** Optional CSS class names */
  className?: string;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation Dialog Component
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-scaleIn"
        role="alertdialog"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <h3 id="dialog-title" className="text-lg font-semibold text-gray-900 mb-2">
          {title}
        </h3>
        <p id="dialog-description" className="text-gray-600 text-sm mb-6">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 active:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition ${
              confirmVariant === 'danger'
                ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * PatternActions provides action buttons for the pattern creator
 */
export const PatternActions: React.FC<PatternActionsProps> = ({
  onSave,
  onSubmit,
  onReset,
  canSave = true,
  canSubmit = true,
  estimatedTime,
  patternName,
  className = '',
}) => {
  const [saveState, setSaveState] = useState<ActionState>('idle');
  const [submitState, setSubmitState] = useState<ActionState>('idle');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle save action
  const handleSave = useCallback(async () => {
    if (!onSave || !canSave) return;

    setSaveState('loading');
    setErrorMessage(null);

    try {
      await onSave();
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (e) {
      setSaveState('error');
      setErrorMessage(e instanceof Error ? e.message : 'Failed to save');
      setTimeout(() => {
        setSaveState('idle');
        setErrorMessage(null);
      }, 3000);
    }
  }, [onSave, canSave]);

  // Handle submit action
  const handleSubmit = useCallback(async () => {
    if (!onSubmit || !canSubmit) return;

    setShowSubmitConfirm(false);
    setSubmitState('loading');
    setErrorMessage(null);

    try {
      await onSubmit();
      setSubmitState('success');
      setTimeout(() => setSubmitState('idle'), 2000);
    } catch (e) {
      setSubmitState('error');
      setErrorMessage(e instanceof Error ? e.message : 'Failed to submit');
      setTimeout(() => {
        setSubmitState('idle');
        setErrorMessage(null);
      }, 3000);
    }
  }, [onSubmit, canSubmit]);

  // Handle reset action
  const handleReset = useCallback(() => {
    setShowResetConfirm(false);
    onReset?.();
  }, [onReset]);

  // Get button content based on state
  const getButtonContent = (
    state: ActionState,
    idleText: string,
    loadingText: string
  ) => {
    switch (state) {
      case 'loading':
        return (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {loadingText}
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Done!
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Failed
          </span>
        );
      default:
        return idleText;
    }
  };

  return (
    <div className={`pattern-actions space-y-3 ${className}`}>
      {/* Error Message Banner */}
      {errorMessage && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Draw Time Estimate */}
      {estimatedTime !== undefined && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-600">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Estimated draw time:{' '}
            <strong className="text-gray-900">
              {estimatedTime < 1 ? '<1' : estimatedTime.toFixed(0)} min
            </strong>
          </span>
        </div>
      )}

      {/* Primary Action: Submit to Queue */}
      {onSubmit && (
        <button
          onClick={() => setShowSubmitConfirm(true)}
          disabled={!canSubmit || submitState === 'loading'}
          className={`
            w-full py-4 px-6 rounded-xl font-semibold text-base
            transition-all duration-200
            flex items-center justify-center gap-2
            min-h-[56px]
            ${
              !canSubmit
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : submitState === 'success'
                ? 'bg-green-500 text-white'
                : submitState === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-md active:shadow-sm'
            }
          `}
        >
          {submitState === 'idle' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          )}
          {getButtonContent(submitState, 'Add to Queue', 'Adding...')}
        </button>
      )}

      {/* Secondary Actions Row */}
      <div className="flex gap-3">
        {/* Save Button */}
        {onSave && (
          <button
            onClick={handleSave}
            disabled={!canSave || saveState === 'loading'}
            className={`
              flex-1 py-3 px-4 rounded-xl font-medium text-sm
              transition-all duration-200
              flex items-center justify-center gap-2
              min-h-[48px]
              ${
                !canSave
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : saveState === 'success'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : saveState === 'error'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100'
              }
            `}
          >
            {saveState === 'idle' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            )}
            {getButtonContent(saveState, 'Save', 'Saving...')}
          </button>
        )}

        {/* Reset Button */}
        {onReset && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="
              flex-1 py-3 px-4 rounded-xl font-medium text-sm
              bg-white text-gray-700 border border-gray-300
              hover:bg-gray-50 active:bg-gray-100
              transition-all duration-200
              flex items-center justify-center gap-2
              min-h-[48px]
            "
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset
          </button>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset Pattern?"
          message="This will clear all your customizations and return to the default settings."
          confirmText="Reset"
          confirmVariant="danger"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* Submit Confirmation Dialog */}
      {showSubmitConfirm && (
        <ConfirmDialog
          title="Add to Queue?"
          message={
            patternName
              ? `"${patternName}" will be added to the sand table queue.${
                  estimatedTime ? ` It will take about ${estimatedTime.toFixed(0)} minutes to draw.` : ''
                }`
              : 'This pattern will be added to the sand table queue.'
          }
          confirmText="Add to Queue"
          confirmVariant="primary"
          onConfirm={handleSubmit}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}
    </div>
  );
};

export default PatternActions;
