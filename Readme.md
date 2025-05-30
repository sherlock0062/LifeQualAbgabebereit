Make sure docker desktop runs before inputting any commands!

# Onetime:

in the terminal: docker network create my-network

so that we have network that both pgadmin4 and all our other containers can communicate over 

-----

in the terminal: docker run -d --name pgadmin4 --network my-network -p 5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@admin.com -e PGADMIN_DEFAULT_PASSWORD=admin -v pgadmin_data:/var/lib/pgadmin dpage/pgadmin4

this creates the pgadmin4 container which then can be started and stopped from docker desktop to look into all our current and future databases.

# docker-compose
naviate to the folder where the docker-compose.yml is and
in the terminal: docker-compose up

to start the container defined by the yml, in this case a postgres database.