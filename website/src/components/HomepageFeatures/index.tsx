import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'django-axes, in TypeScript',
    icon: 'Ax',
    description: (
      <>
        Persistent failed-attempt tracking keyed on username, IP, combinations,
        or <code>+user_agent</code>. Trip a failure limit and the identity is
        locked out for a cooloff — including <strong>tiered</strong> cooloff that
        grows with each lockout.
      </>
    ),
  },
  {
    title: 'Framework-agnostic core',
    icon: 'Zero',
    description: (
      <>
        <code>@authlock/core</code> has zero runtime dependencies — no NestJS, no
        DI, no decorators. Use it from Express, inversify, tsyringe, or a bare
        script. The neutral core <em>is</em> the cross-framework story.
      </>
    ),
  },
  {
    title: 'Pluggable store',
    icon: 'DB',
    description: (
      <>
        A <code>LockoutStore</code> seam — an in-memory store ships in the box,
        and a Drizzle-backed store (SQLite, Postgres, MySQL) is the
        batteries-included default, with an <strong>atomic</strong> increment
        that is correct across instances.
      </>
    ),
  },
  {
    title: 'Honest NestJS adapter',
    icon: 'DI',
    description: (
      <>
        NestJS has no ambient login-failure signal, so{' '}
        <code>@nest-native/lockout</code> is explicit by design: a{' '}
        <code>LockoutGuard</code>, a <code>LockoutService</code> you call from
        your login handler, and a Passport recipe.
      </>
    ),
  },
  {
    title: 'fail-open by default',
    icon: 'Safe',
    description: (
      <>
        If the store errors, the engine <strong>allows</strong> and logs — a DB
        blip must not lock every user out. Flip <code>failMode: 'closed'</code>{' '}
        for high-security deployments. Both paths are tested.
      </>
    ),
  },
  {
    title: 'Correctness is the product',
    icon: 'Test',
    description: (
      <>
        This is security-critical code: the atomic cross-instance increment, the
        any-key-trips-the-lock rule, and both failure modes are covered to 100%,
        and every change ships with a security pass.
      </>
    ),
  },
];

function Feature({title, icon, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md feature-card">
        <div className={styles.featureIcon}>{icon}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
