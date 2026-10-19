.PHONY: up build prod down logs

up:       ## dev server with hot reload on http://localhost:5173
	docker compose up --build dev

build:    ## production image
	docker compose --profile prod build prod

prod:     ## production build served by nginx on http://localhost:8080
	docker compose --profile prod up --build prod

down:
	docker compose --profile prod down

logs:
	docker compose logs -f
