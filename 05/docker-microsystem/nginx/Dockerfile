# nginx: Web Server + Reverse Proxy
FROM nginx:1.27-alpine

# 自訂 reverse proxy 設定
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf
# 簡易 web 介面 (靜態檔由 nginx 直接 serve)
COPY ./frontend/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
