Make sure docker desktop runs before inputting any commands!

# Onetime:

in the terminal: docker network create my-network

so that we have network that both pgadmin4 and all our other containers can communicate over 

-----

in the terminal: docker run -d --name pgadmin4 --network my-network -p 5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@admin.com -e PGADMIN_DEFAULT_PASSWORD=admin -v pgadmin_data:/var/lib/pgadmin dpage/pgadmin4

this creates the pgadmin4 container which then can be started and stopped from docker desktop to look into all our current and future databases.

# docker-compose and database population
naviate to the folder where the docker-compose.yml is and
in the terminal: docker-compose up -d

to start the container defined by the yml, in this case a postgres database detached.
if there are any issues with the database volume
in the terminal: docker-compose down -v
will delte the volume so you can start anew. be aware that this
will delete all data of the database. 

then navigate to db where the import_data.py is and write'
in the terminal: pip install -r requirements.txt
to install the require python psycopg2-binary==2.9.9 
which we need for our import_data.py
then
in the terminal: python import_data.py
to run the script to import our data in the database.


# Api

Now we have to work on the api:

navigate to the api folder and
in the terminal: npm install

if you get an error due to about_Execution_Policies
run PowerShell as Administrator and
in the terminal: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

then
in the terminal: npm start
to start up our server.

and then
double click on the home.html to test out the website!