import {AccountGate,AccountNav} from '../AccountSession';
export default function StudioLayout({children}:{children:React.ReactNode}){return <AccountGate><AccountNav/>{children}</AccountGate>;}
