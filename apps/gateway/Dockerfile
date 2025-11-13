FROM nginx:alpine
COPY apps/gateway/nginx.conf.template /etc/nginx/nginx.conf.template
COPY apps/gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

CMD ["nginx", "-g", "daemon off;"]