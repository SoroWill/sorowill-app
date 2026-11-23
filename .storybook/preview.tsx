import type { Preview } from '@storybook/react';
import { NextIntlClientProvider } from 'next-intl';

import { ToastProvider } from '../src/components/Toast';
import messages from '../src/messages/en.json';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // The components are styled for the app's dark background (`will-dark`); on white the light text disappears.
    backgrounds: {
      default: 'will-dark',
      values: [{ name: 'will-dark', value: '#1E1B4B' }],
    },
  },
  decorators: [
    // Components read translations and show toasts, so every story gets both providers.
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToastProvider>
          <Story />
        </ToastProvider>
      </NextIntlClientProvider>
    ),
  ],
};

export default preview;
