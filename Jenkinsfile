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
                sh '''
                    mkdir -p $APP_DIR
                    rsync -av --delete \
                    --exclude='.git' \
                    --exclude='node_modules' \
                    ./ $APP_DIR/
                    cd $APP_DIR
                    npm install --omit=dev
                '''
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