export const ADMIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>频道目录管理</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#18212b;font:15px system-ui,sans-serif}
    header{background:#18212b;color:#fff;padding:18px 24px}h1{font-size:20px;margin:0;letter-spacing:0}
    main{max-width:900px;margin:28px auto;padding:0 20px}label{display:block;font-weight:650;margin:0 0 8px}
    input,textarea,button{font:inherit}input[type=file]{width:100%;padding:12px;background:#fff;border:1px solid #aeb8c2;border-radius:6px}
    textarea{width:100%;height:52vh;min-height:280px;margin-top:16px;padding:12px;border:1px solid #aeb8c2;border-radius:6px;resize:vertical;font-family:Consolas,monospace;font-size:13px}
    .actions{display:flex;align-items:center;gap:16px;margin-top:14px}button{border:0;border-radius:6px;background:#0b6e4f;color:#fff;padding:11px 18px;font-weight:700;cursor:pointer}
    button:disabled{background:#7d8a86;cursor:wait}#status{min-height:22px;color:#425466;overflow-wrap:anywhere}.error{color:#b42318!important}.ok{color:#087443!important}
  </style>
</head>
<body>
  <header><h1>频道目录管理</h1></header>
  <main>
    <label for="file">频道目录 JSON</label>
    <input id="file" type="file" accept="application/json,.json">
    <textarea id="content" spellcheck="false" aria-label="频道目录 JSON"></textarea>
    <div class="actions"><button id="submit" type="button">上传并检查</button><span id="status"></span></div>
  </main>
  <script>
    const file=document.getElementById('file'),content=document.getElementById('content'),button=document.getElementById('submit'),status=document.getElementById('status');
    file.addEventListener('change',async()=>{if(file.files[0])content.value=await file.files[0].text()});
    button.addEventListener('click',async()=>{
      button.disabled=true;status.className='';status.textContent='正在上传...';
      try{
        JSON.parse(content.value);
        const response=await fetch('/admin/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:content.value});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||('HTTP '+response.status));
        status.className='ok';status.textContent='已保存：'+result.channelCount+' 个频道，CN '+result.cnChannelCount+' 个；健康检查已启动';
      }catch(error){status.className='error';status.textContent=error instanceof Error?error.message:String(error)}
      finally{button.disabled=false}
    });
  </script>
</body>
</html>`;
