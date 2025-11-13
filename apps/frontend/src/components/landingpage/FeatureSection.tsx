import { CloudArrowUpIcon, LockClosedIcon, ServerIcon } from '@heroicons/react/20/solid'

const features = [
  {
    name: 'Doctors: Reach Patients Worldwide',
    description:
      'Connect with a global community of health-conscious patients and receive instant, borderless payments for your expertise.',
    icon: CloudArrowUpIcon,
  },
  {
    name: 'Patients: Talk to a BVSD Doc',
    description: 'Connect with a doctor who escaped the fiat healthcare system. Experience pre-1950s healthcare with 2025 technology.',
    icon: LockClosedIcon,
  },
  {
    name: 'Minimum Bureaucracy',
    description: 'We hate filling out forms as much as anyone. Our promise to both patients and doctors--we ask for the bare minimum in busywork. Just whatever we have to do to avoid jail.',
    icon: ServerIcon,
  },
]

export function FeatureSection() {
  return (
    <div className="overflow-hidden bg-[#F7F5F3]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-2">
          <div className="lg:pt-4 lg:pr-8">
            <div className="lg:max-w-lg">
              <h2 className="text-base/7 font-semibold text-[rgba(55,50,47,0.80)]">Say Goodbye to Waiting Rooms</h2>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-pretty text-[#37322F] sm:text-4xl">
                The House Call is Back
              </p>
              <p className="mt-6 text-lg/8 text-[rgba(55,50,47,0.80)]">
                Experience healthcare the way your Grandmother remembered it
              </p>
              <dl className="mt-10 max-w-xl space-y-8 text-base/7 text-[rgba(55,50,47,0.70)] lg:max-w-none">
                {features.map((feature) => (
                  <div key={feature.name} className="relative pl-9">
                    <dt className="inline font-semibold text-[#37322F]">
                      <feature.icon
                        aria-hidden="true"
                        className="absolute top-1 left-1 size-5 text-[#37322F]"
                      />
                      {feature.name}
                    </dt>{' '}
                    <dd className="inline">{feature.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <img
            alt="Product screenshot"
            src="https://tailwindcss.com/plus-assets/img/component-images/project-app-screenshot.png"
            width={2432}
            height={1442}
            className="w-[48rem] max-w-none rounded-xl shadow-md ring-1 ring-gray-400/10 sm:w-[57rem] md:-ml-4 lg:-ml-0 dark:hidden dark:ring-white/10"
          />
        </div>
      </div>
    </div>
  )
}