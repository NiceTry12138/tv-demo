# Ubuntu 22.04 部署

以下以 Ubuntu 22.04 LTS、域名 `tv.example.com`、仓库目录 `/opt/tv-demo` 为例。
推荐原生 `systemd + Nginx`：组件少，日志和自动重启由系统管理。另提供 Docker 方法。

## 1. DNS 和防火墙

先把域名 A/AAAA 记录指向服务器。只开放 SSH、HTTP、HTTPS；Node 的 8080 端口不对公网开放。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

启用 UFW 前确认当前 SSH 连接使用的端口已放行。

## 2. 安装 Node.js 22、Git、Nginx

Ubuntu 22.04 默认 Node 版本太旧，使用 NodeSource 22 仓库：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git nginx
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
node --version
```

预期主版本为 `v22`。

## 3. 下载和构建

可以直接使用 GitHub Release 中的服务器包，或在 Ubuntu 上从源码构建。下面先写源码方式：

```bash
sudo git clone https://github.com/NiceTry12138/tv-demo.git /opt/tv-demo
cd /opt/tv-demo/server
sudo npm ci
sudo npm test
sudo npm run build
```

如果使用 GitHub Release：

1. 打开仓库 Releases，选择目标构建。
2. 下载 Release 中固定名称的 `hometv-server.tar.gz`。
3. 上传到服务器并解压：

```bash
sudo mkdir -p /opt/tv-demo/server
sudo tar -xzf home-tv-server-*.tar.gz -C /opt/tv-demo/server
```

4. 从本节后续用户与 systemd 配置步骤继续；压缩包已包含 `dist`，不需要再次构建。

创建专用系统用户；它没有登录 Shell，只能写运行数据目录：

```bash
sudo useradd --system --home /var/lib/home-tv-server \
  --shell /usr/sbin/nologin home-tv
```

若用户已存在，`useradd` 会提示存在，可继续下一步。

## 4. 安装 systemd 服务

```bash
sudo cp /opt/tv-demo/server/deploy/home-tv-server.env.example /etc/home-tv-server.env
sudo cp /opt/tv-demo/server/deploy/systemd/home-tv-server.service \
  /etc/systemd/system/home-tv-server.service
sudo chmod 640 /etc/home-tv-server.env
sudo chown root:home-tv /etc/home-tv-server.env
sudo editor /etc/home-tv-server.env
sudo systemctl daemon-reload
sudo systemctl enable --now home-tv-server
sudo systemctl status home-tv-server --no-pager
```

编辑时必须设置管理密码：

```properties
ADMIN_USERNAME=cong01
ADMIN_PASSWORD=你的管理密码
```

不要把真实密码提交到 Git。管理接口使用 Basic Auth，必须通过后续 Nginx HTTPS 访问。

只有公网 IP、没有域名时，不要把管理接口暴露在公网 HTTP。保持 `HOST=127.0.0.1`，从本机建立
SSH 隧道：

```powershell
ssh -L 18080:127.0.0.1:8080 ubuntu@服务器IP
```

再访问 `http://127.0.0.1:18080/admin`，或让上传脚本连接
`http://127.0.0.1:18080`。管理接口会拒绝非本机的 HTTP 请求。

检查本机接口：

```bash
curl -i http://127.0.0.1:8080/healthz
curl -i http://127.0.0.1:8080/readyz
curl -s http://127.0.0.1:8080/iptv/v1/status.json | python3 -m json.tool
curl -s 'http://127.0.0.1:8080/iptv/v1/status.json?country=CN' | python3 -m json.tool
```

服务器不访问 GitHub 或频道目录来源。首次上传频道前，`/readyz` 和频道接口返回 `503`；上传后
立即检查，之后每小时重新检查。日志：

```bash
sudo journalctl -u home-tv-server -f
```

上传目录和健康缓存保存在 `/var/lib/home-tv-server`，代码更新不会删除它。

### 局域网 IP + 端口直连（调试）

生产默认只监听 `127.0.0.1:8080`，Android TV 不能直接访问。若需要在同一局域网用
`服务器IP:8080` 调试，修改 `/etc/home-tv-server.env`：

```properties
HOST=0.0.0.0
PORT=8080
```

然后重启，并只允许家庭局域网访问；下面示例按 `192.168.1.0/24`：

```bash
sudo systemctl restart home-tv-server
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
```

App 中填写 Ubuntu 服务器的局域网 IPv4 和 `8080`。公网环境不要直接开放 8080，应继续使用
Nginx/HTTPS。调试结束执行下列命令，并把 `HOST` 改回 `127.0.0.1`：

```bash
sudo ufw delete allow from 192.168.1.0/24 to any port 8080 proto tcp
sudo systemctl restart home-tv-server
```

## 5. 配置 Nginx 和 HTTPS

先替换配置中的 `tv.example.com`：

```bash
sudo cp /opt/tv-demo/server/deploy/nginx/home-tv-server.conf \
  /etc/nginx/sites-available/home-tv-server
sudo sed -i 's/tv\.example\.com/你的真实域名/g' \
  /etc/nginx/sites-available/home-tv-server
sudo ln -s /etc/nginx/sites-available/home-tv-server \
  /etc/nginx/sites-enabled/home-tv-server
sudo nginx -t
sudo systemctl reload nginx
```

安装 Certbot 并申请证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的真实域名
sudo certbot renew --dry-run
```

公网验证：

```bash
curl -i https://你的真实域名/iptv/v1/status.json
curl -i https://你的真实域名/iptv/v1/channels.json
curl -i 'https://你的真实域名/iptv/v1/channels.json?country=CN'
```

浏览器打开：

```text
https://你的真实域名/admin
```

输入 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 后，可选择本机生成的 JSON 并上传。

## 6. 在本机收集并上传频道

本步骤在能够访问频道目录来源的 Windows/macOS/Linux 电脑执行，不在 Ubuntu 服务器执行。
需要 Python 3.10+，无第三方依赖：

```powershell
cd server
$env:TV_ADMIN_PASSWORD="你的管理密码"
python tools/collect_and_upload.py `
  --server https://你的真实域名 `
  --username cong01
```

默认收集 iptv-org、fanmingming/live、YueChan/Live、live.zbds.top 和
tv.iill.top/m3u/Gather。脚本按流 URL 去重，在本机以 GET 并发检查，只上传通过源。默认单源
超时 8 秒、16 并发，可用 `--check-timeout`、`--check-workers` 调整。零个源通过时不写文件、
不上传。服务器收到后再次检查并每小时复查，因为本机、服务器和电视网络出口可能不同。

App 配置：

```properties
CHANNELS_URL=https://你的真实域名/iptv/v1/channels.json
```

## 7. 更新版本

```bash
cd /opt/tv-demo
sudo git pull --ff-only
cd server
sudo npm ci
sudo npm test
sudo npm run build
sudo systemctl restart home-tv-server
curl -i http://127.0.0.1:8080/readyz
```

若新版本失败，可切回上一 Git 提交并重新构建。频道运行数据位于 `/var/lib`，不会被覆盖。

## 8. Docker 方法

已安装 Docker Engine 和 Compose Plugin 时：

```bash
cd /opt/tv-demo/server
export ADMIN_PASSWORD='你的管理密码'
sudo --preserve-env=ADMIN_PASSWORD docker compose up -d --build
sudo docker compose ps
curl -i http://127.0.0.1:8080/readyz
```

仍需按第 5 节配置 Nginx/HTTPS。不要同时启动 systemd 和 Compose，否则都会占用 8080。
