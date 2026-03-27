pipeline {
    agent any

    environment {
        APP_DIR = "/var/www/fitness_exercises"
        APP_NAME = "fitness_exercises"
        APP_PORT = "3000"
    }

    stages {

        stage('Clone Repo') {
            steps {
                checkout scm
                echo "Code checked out from branch: ${env.BRANCH_NAME}"
            }
        }

        stage('Environment Setup') {
            steps {
                withCredentials([file(credentialsId: 'ENV_PRODUCTION', variable: 'ENV_FILE')]) {
                    sh '''
                        cp $ENV_FILE .env
                        chmod 644 .env
                    '''
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Deploy') {
    steps {
        withCredentials([file(credentialsId: 'ENV_PRODUCTION', variable: 'ENV_FILE')]) {
            sh '''
                mkdir -p /var/www/fitness_exercises

                rsync -av --delete \
                  --no-group \
                  --exclude=.git \
                  --exclude=node_modules \
                  ./ /var/www/fitness_exercises/

                cp "$ENV_FILE" /var/www/fitness_exercises/.env
                cd /var/www/fitness_exercises
                npm ci --omit=dev
            '''
        }
    }
}

        stage('Restart Server') {
            steps {
                sh '''
                    cd $APP_DIR
                    
                    # If old process is still holding the API port, kill it first.
                    if lsof -ti tcp:$APP_PORT >/dev/null 2>&1; then
                      echo "Port $APP_PORT is busy. Stopping old process..."
                      fuser -k $APP_PORT/tcp || sudo fuser -k $APP_PORT/tcp || true
                    fi

                    # Replace process in PM2 with latest code/env.
                    pm2 delete "$APP_NAME" || true
                    pm2 start npm --name "$APP_NAME" -- run start --update-env
                    pm2 save
                    pm2 ls
                '''
            }
        }
    }
}