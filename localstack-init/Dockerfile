FROM node:18-alpine

# Use HTTP instead of HTTPS for Alpine repositories to bypass SSL issues
RUN sed -i 's/https/http/g' /etc/apk/repositories && \
    apk update --no-cache && \
    apk add --no-cache zip aws-cli python3 dos2unix

COPY ./localstack-init/register-lambdas.entrypoint /register-lambdas.sh
RUN dos2unix /register-lambdas.sh && chmod +x /register-lambdas.sh

ENTRYPOINT ["/register-lambdas.sh"]
