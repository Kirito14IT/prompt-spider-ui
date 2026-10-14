// The original measured demo remains its own unchanged entry point.
let project={};
let configError=null;
try {
  const response=await fetch('/project-config.json',{cache:'no-store'});
  if(response.status!==404){
    if(!response.ok)throw Error(`加载失败，HTTP ${response.status}`);
    project=await response.json();
    if(!project||typeof project!=='object'||Array.isArray(project))throw Error('配置必须是 JSON 对象，不能是数组或 null');
  }
}catch(error){configError=error;}
if(configError){
  const diagnostic=document.createElement('div');diagnostic.id='projectConfigError';diagnostic.setAttribute('role','alert');diagnostic.className='selection';
  const title=document.createElement('strong');title.textContent='project-config.json 配置错误';
  const detail=document.createElement('p');detail.textContent=`${configError.message}。请修正项目根目录中的 project-config.json，然后刷新页面。`;
  diagnostic.append(title,detail);document.querySelector('#stageHost').replaceChildren(diagnostic);document.querySelector('.transport').hidden=true;document.querySelector('#inspectorToggle').hidden=true;document.title='project-config.json 配置错误 · Prompt Spider';
}else if(new URLSearchParams(location.search).has('session') || Object.keys(project).length) {
  const {startLive}=await import('./live.js');
  await startLive(project);
} else await import('./main.js');
