import { startApp } from './app';

if (new URLSearchParams(location.search).get('audience') === '1') void import('./present/show').then((m) => m.bootAudience());
else void startApp();
