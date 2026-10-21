import { redirect } from 'next/navigation';

/** Sign-up and log-in are the same page. */
export default function SignupPage() {
  redirect('/login');
}
