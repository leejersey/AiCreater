import type {Metadata} from 'next';
import './style.css';
import {AccountSession} from './AccountSession';
import {ConfirmProvider} from './ConfirmContext';
import {ToastProvider} from './ToastContext';
export const metadata: Metadata = {title: 'AI Creater · 教学视频工作台', description: '通用知识、编程与AI教学视频编辑器'};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="zh-CN"><body><AccountSession><ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider></AccountSession></body></html>;
}
