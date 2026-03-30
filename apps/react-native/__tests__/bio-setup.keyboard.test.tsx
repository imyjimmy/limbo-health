import React from 'react';
import * as ReactNative from 'react-native';
import { act, create } from 'react-test-renderer';
import BioSetupScreen from '../app/bio-setup';
import { emptyBioProfile } from '../types/bio';

const mockRouterReplace = jest.fn();
const mockSaveProfile = jest.fn();
const mockCompleteOnboarding = jest.fn();
const mockUseBioProfile = jest.fn();
const mockUseAuthContext = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: unknown) => factory,
  useTheme: () => ({
    colors: {
      inputPlaceholder: '#94A3B8',
      secondary: '#0F766E',
    },
  }),
  useThemedStyles: () =>
    new Proxy(
      {},
      {
        get: () => ({}),
      },
    ),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('../providers/BioProfileProvider', () => ({
  useBioProfile: () => mockUseBioProfile(),
}));

function getInput(tree: any, testID: string) {
  return tree.root.findByProps({ testID });
}

function changeText(tree: any, testID: string, value: string) {
  act(() => {
    getInput(tree, testID).props.onChangeText(value);
  });
}

describe('BioSetupScreen keyboard done behavior', () => {
  beforeEach(() => {
    jest.restoreAllMocks();

    mockUseAuthContext.mockReturnValue({
      completeOnboarding: mockCompleteOnboarding,
    });

    mockUseBioProfile.mockReturnValue({
      status: 'ready',
      profile: null,
      suggestedProfile: emptyBioProfile(),
      saveProfile: mockSaveProfile,
      hasProfile: false,
    });

    jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });

    jest.spyOn(ReactNative.Keyboard, 'addListener').mockImplementation(
      () =>
        ({
          remove: jest.fn(),
        }) as any,
    );

    jest.spyOn(ReactNative.Keyboard, 'dismiss').mockImplementation(jest.fn());
  });

  it('keeps Done hidden until every required field in basic details is valid, then shows it on the phone keypad', () => {
    let tree: any;

    act(() => {
      tree = create(<BioSetupScreen />);
    });

    changeText(tree!, 'bio-setup-full-name-input', 'Jimmy Zhang');
    changeText(tree!, 'bio-setup-date-of-birth-input', '01/14/1989');
    changeText(tree!, 'bio-setup-last4-ssn-input', '7116');
    changeText(tree!, 'bio-setup-email-input', 'imyjimmy@gmail.com');

    expect(getInput(tree!, 'bio-setup-last4-ssn-input').props.inputAccessoryViewButtonLabel).toBe(
      undefined,
    );
    expect(getInput(tree!, 'bio-setup-phone-number-input').props.inputAccessoryViewButtonLabel).toBe(
      undefined,
    );
    expect(getInput(tree!, 'bio-setup-email-input').props.returnKeyType).toBe('default');

    changeText(tree!, 'bio-setup-phone-number-input', '2532257825');

    expect(getInput(tree!, 'bio-setup-phone-number-input').props.inputAccessoryViewButtonLabel).toBe(
      'Done',
    );
    expect(getInput(tree!, 'bio-setup-phone-number-input').props.returnKeyType).toBe('done');
    expect(getInput(tree!, 'bio-setup-email-input').props.returnKeyType).toBe('done');
  });

  it('keeps the address postal-code Done hidden until the whole address step is valid', () => {
    let tree: any;

    act(() => {
      tree = create(<BioSetupScreen />);
    });

    changeText(tree!, 'bio-setup-address-line1-input', '801 W 5th St');
    changeText(tree!, 'bio-setup-city-input', 'Austin');
    changeText(tree!, 'bio-setup-state-input', 'TX');

    expect(getInput(tree!, 'bio-setup-postal-code-input').props.inputAccessoryViewButtonLabel).toBe(
      undefined,
    );

    changeText(tree!, 'bio-setup-postal-code-input', '78703');

    expect(getInput(tree!, 'bio-setup-postal-code-input').props.inputAccessoryViewButtonLabel).toBe(
      'Done',
    );
    expect(getInput(tree!, 'bio-setup-postal-code-input').props.returnKeyType).toBe('done');
  });
});
