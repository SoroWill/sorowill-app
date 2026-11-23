'use client';

import { useState } from 'react';

const TOTAL_STEPS = 5;

const STEP_LABELS = [
  'Personal Details',
  'Assets',
  'Beneficiaries',
  'Executors',
  'Review & Sign',
];

const STEP_ESTIMATED_MINUTES = [2, 3, 3, 2, 2];

interface StepIndicatorProps {
  currentStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

function StepIndicator({
  currentStep,
  completedSteps,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Will creation progress">
      <p className="step-summary">
        Step {currentStep} of {TOTAL_STEPS}
      </p>
      <ol className="step-list">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = completedSteps.includes(stepNumber);
          return (
            <li
              key={label}
              className={[
                'step-item',
                isActive ? 'step-item--active' : '',
                isCompleted ? 'step-item--completed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                onClick={() => onStepClick(stepNumber)}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${stepNumber}: ${label}${
                  isCompleted ? ' (completed)' : ''
                }`}
              >
                <span className="step-number">
                  {isCompleted ? '✓' : stepNumber}
                </span>
                <span className="step-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function getEstimatedMinutesRemaining(currentStep: number): number {
  let remaining = 0;
  for (let i = currentStep - 1; i < TOTAL_STEPS; i += 1) {
    remaining += STEP_ESTIMATED_MINUTES[i];
  }
  return remaining;
}

export default function WillCreationPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const estimatedMinutes = getEstimatedMinutesRemaining(currentStep);

  const markCompleted = (step: number) => {
    setCompletedSteps((prev) =>
      prev.includes(step) ? prev : [...prev, step].sort((a, b) => a - b)
    );
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return Boolean(formData.fullName && formData.dateOfBirth);
      case 2:
        return Boolean(formData.assets);
      case 3:
        return Boolean(formData.beneficiaries);
      case 4:
        return Boolean(formData.executor);
      default:
        return true;
    }
  };

  const goToStep = (step: number) => {
    if (step < 1 || step > TOTAL_STEPS) {
      return;
    }
    setCurrentStep(step);
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      return;
    }
    markCompleted(currentStep);
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepClick = (step: number) => {
    // Allow navigating back to any previous step or skipping forward.
    // Validation is still enforced when advancing via "Next".
    goToStep(step);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <h2>Personal Details</h2>
            <label>
              Full Name
              <input
                type="text"
                name="fullName"
                value={formData.fullName ?? ''}
                onChange={handleChange}
              />
            </label>
            <label>
              Date of Birth
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
        );
      case 2:
        return (
          <div>
            <h2>Assets</h2>
            <label>
              List your assets
              <textarea
                name="assets"
                value={formData.assets ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
        );
      case 3:
        return (
          <div>
            <h2>Beneficiaries</h2>
            <label>
              List your beneficiaries
              <textarea
                name="beneficiaries"
                value={formData.beneficiaries ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
        );
      case 4:
        return (
          <div>
            <h2>Executors</h2>
            <label>
              Name your executor
              <input
                type="text"
                name="executor"
                value={formData.executor ?? ''}
                onChange={handleChange}
              />
            </label>
          </div>
        );
      case 5:
        return (
          <div>
            <h2>Review &amp; Sign</h2>
            <p>Review your will before signing.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="will-creation">
      <h1>Create Your Will</h1>
      <StepIndicator
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
      />
      <p className="estimated-time" aria-live="polite">
        Estimated time remaining: ~{estimatedMinutes} minute
        {estimatedMinutes === 1 ? '' : 's'}
      </p>
      <section className="step-content">{renderStepContent()}</section>
      <div className="step-controls">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
        >
          Back
        </button>
        {currentStep < TOTAL_STEPS && (
          <button type="button" onClick={handleSkip}>
            Skip
          </button>
        )}
        {currentStep < TOTAL_STEPS ? (
          <button type="button" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button type="button" onClick={() => markCompleted(currentStep)}>
            Finish
          </button>
        )}
      </div>
    </main>
  );
}
