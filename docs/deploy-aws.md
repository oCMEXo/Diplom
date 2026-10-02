# Развёртывание в AWS

Реализация [ADR-004](adr/004-deploy-aws.md): один EC2 с Docker Compose
(api, collab, runner, Redis, Caddy), PostgreSQL в RDS, фронтенд в S3 за
CloudFront.

> **Статус проверки.** Docker-образы, `docker-compose.yml` и скрипты
> описаны и использованы по тем же рецептам, что работают локально, но
> **на реальном аккаунте AWS эта инструкция ещё не прогонялась** — у
> разработки не было доступа к облаку. Перед защитой пройти её один раз
> целиком и поправить то, что разойдётся с реальностью; актуальные цены и
> условия free tier стоит проверить заранее.

## 1. База данных (RDS)

1. RDS → Create database → PostgreSQL 16, шаблон Free tier / `db.t4g.micro`.
2. Имя БД `collab`, пользователь `collab`, сгенерированный пароль.
3. Public access: **No**. Security group `collab-db` разрешает порт 5432
   только из security group `collab-ec2` (см. ниже).

## 2. Сервер (EC2)

1. EC2 → Launch instance: Ubuntu 24.04, `t3.small` (2 ГБ ОЗУ — собирать
   образы на `t3.micro` тесно), диск 20 ГБ. Security group `collab-ec2`:
   входящие 22 (только ваш IP), 80 и 443 (всем).
2. Elastic IP — привязать к инстансу, чтобы адрес не менялся.
3. Установить Docker и клонировать репозиторий:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   git clone <url-репозитория> ~/collab-code-platform
   ```

4. DNS: две записи A (`api.…` и `collab.…`) на Elastic IP. Без своего
   домена подойдёт [sslip.io](https://sslip.io): для IP `203.0.113.10`
   имена `api.203-0-113-10.sslip.io` и `collab.203-0-113-10.sslip.io` уже
   резолвятся, Caddy выпустит для них сертификаты.
5. Конфигурация:

   ```bash
   cd ~/collab-code-platform
   cp infra/.env.prod.example infra/.env
   nano infra/.env      # домены, DATABASE_URL (RDS), JWT-секреты, CORS_ORIGIN
   ```

6. Первый запуск: `./infra/deploy.sh` (подтягивает образы песочницы,
   собирает сервисы, применяет миграции, поднимает стек).

Runner получает доступ к Docker-сокету хоста, чтобы запускать песочницы, —
это осознанный компромисс ADR-004: компрометация runner равна доступу к
Docker на этом хосте. Поэтому на машине нет ничего, кроме самого стека, а
код пользователей исполняется только в контейнерах с ограничениями из
[ADR-003](adr/003-code-execution-docker-queue.md).

## 3. Фронтенд (S3 + CloudFront)

1. S3: бакет без публичного доступа (Block all public access — включён).
2. CloudFront: origin — бакет через Origin Access Control; Default root
   object `index.html`; custom error responses 403 и 404 → `/index.html`
   с кодом 200 (иначе прямые ссылки вида `/join/…` отдадут ошибку).
3. Адрес CloudFront-дистрибутива (`https://dxxxx.cloudfront.net`) записать
   в `CORS_ORIGIN` на сервере.
4. Сборка и выкладка (то же делает workflow ниже):

   ```bash
   VITE_API_URL=https://api.<домен> VITE_COLLAB_URL=wss://collab.<домен> \
     pnpm --filter @collab/web build
   aws s3 sync apps/web/dist s3://<бакет> --delete
   aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
   ```

## 4. Автоматический деплой (GitHub Actions)

Workflow `.github/workflows/deploy.yml` запускается вручную (Actions → Deploy →
Run workflow). Секреты репозитория: `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`,
`CLOUDFRONT_DISTRIBUTION_ID`, `VITE_API_URL`, `VITE_COLLAB_URL`,
`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`. IAM-пользователю хватает прав на
`s3:PutObject/DeleteObject/ListBucket` для бакета и
`cloudfront:CreateInvalidation`.

## 5. Проверка после выкладки

```bash
curl https://api.<домен>/health          # {"status":"ok"}
docker compose -f infra/docker-compose.yml --env-file infra/.env ps
```

Затем в браузере: открыть адрес CloudFront, зайти гостем, создать проект и
файл, открыть ссылку-приглашение во втором окне и убедиться, что правки и чат
синхронизируются, а «Запустить» выдаёт вывод.

## Путь расширения

При росте нагрузки сервисы переносятся на ECS с ALB (api и collab —
Fargate), а runner остаётся на EC2 с Docker-демоном — см. сравнение в
ADR-004. Рассылку событий проекта (`/ws`) при нескольких экземплярах api нужно
перевести с in-memory хаба на Redis pub/sub.
