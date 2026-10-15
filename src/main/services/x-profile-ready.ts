/** Wait for the requested React profile, not merely the HTML load event. */
export function xProfileReadyScript(handle: string) {
  return `(() => new Promise((resolve, reject) => {
    const expected=${JSON.stringify(handle.toLowerCase())};
    const deadline=Date.now()+12000;
    const poll=()=>{
      if(location.pathname.toLowerCase().replace(/\\/$/,'')!=='/'+expected)
        return reject(new Error('Страница X изменилась во время загрузки профиля.'));
      const root=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
      const identity=root?.querySelector('[data-testid="UserName"]')?.innerText||'';
      const handles=identity.match(/@[a-z0-9_]{1,15}/gi)||[];
      const following=root?.querySelector('a[href="/'+expected+'/following" i]');
      if(handles.some(h=>h.toLowerCase()==='@'+expected)&&following?.innerText.trim())return resolve(true);
      if(Date.now()>=deadline)return reject(new Error('X не загрузил профиль и счётчик подписок за 12 секунд.'));
      setTimeout(poll,100);
    };
    poll();
  }))()`;
}
