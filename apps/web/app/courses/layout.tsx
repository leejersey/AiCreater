import {AccountGate,AccountNav} from '../AccountSession';
export default function CoursesLayout({children}:{children:React.ReactNode}){return <AccountGate><AccountNav/>{children}</AccountGate>;}
