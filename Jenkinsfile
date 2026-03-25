pipeline {
    agent any

    environment {
        APP_DIR = "/var/www/fitness_exercises"
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
                sh 'npm install'
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

                    pm2 reload fitness_exercises || pm2 start npm --name fitness_exercises -- run start

                    pm2 save
                '''
            }
        }
    }
}