pipeline {
    agent any

    environment {
        CLIENT_REPO = "https://github.com/Mickaell22/chat-client.git"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout frontend') {
            steps {
                echo "Clonando el repositorio del frontend (chat-client)..."
                sh 'rm -rf chat-client && git clone --depth 1 $CLIENT_REPO chat-client'
            }
        }

        stage('Validacion') {
            steps {
                echo "Validando estructura minima del proyecto..."
                sh 'test -f Dockerfile'
                sh 'test -f docker-compose.deploy.yml'
                sh 'test -f chat-client/Dockerfile'
                echo "Validacion OK"
            }
        }

        stage('Build imagenes (staging)') {
            steps {
                echo "Construyendo imagen del backend..."
                sh 'docker build -t chat-server:staging .'
                echo "Construyendo imagen del frontend (apuntando a staging :4001)..."
                sh '''docker build -t chat-client:staging \
                        --build-arg VITE_API_URL=http://localhost:4001 \
                        --build-arg VITE_SOCKET_URL=http://localhost:4001 \
                        chat-client'''
            }
        }

        stage('Test') {
            steps {
                echo "Ejecutando pruebas unitarias dentro de la imagen del backend..."
                sh '''docker run --rm chat-server:staging sh -c '
                    for f in $(find src -name "*.test.js" | sort); do
                        echo "== $f =="
                        node "$f" || exit 1
                    done
                '  '''
            }
        }

        stage('Deploy a Staging') {
            steps {
                echo "Desplegando en STAGING (puerto 8081)..."
                withCredentials([
                    string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET'),
                    string(credentialsId: 'postgres-password', variable: 'POSTGRES_PASSWORD')
                ]) {
                    sh 'docker compose -p chat -f docker-compose.deploy.yml up -d db-staging server-staging client-staging'
                }
                echo "Staging actualizado. Verifica en: http://localhost:8081"
            }
        }

        stage('Aprobacion para Produccion') {
            steps {
                input message: 'Aprobar despliegue a PRODUCCION?', ok: 'Si, desplegar'
            }
        }

        stage('Promover imagenes a Produccion') {
            steps {
                echo "Promoviendo backend (mismo artefacto) a produccion..."
                sh 'docker tag chat-server:staging chat-server:production'
                echo "Reconstruyendo frontend para produccion (apuntando a :4002)..."
                sh '''docker build -t chat-client:production \
                        --build-arg VITE_API_URL=http://localhost:4002 \
                        --build-arg VITE_SOCKET_URL=http://localhost:4002 \
                        chat-client'''
            }
        }

        stage('Deploy a Produccion') {
            steps {
                echo "Desplegando en PRODUCCION (puerto 8082)..."
                withCredentials([
                    string(credentialsId: 'jwt-secret', variable: 'JWT_SECRET'),
                    string(credentialsId: 'postgres-password', variable: 'POSTGRES_PASSWORD')
                ]) {
                    sh 'docker compose -p chat -f docker-compose.deploy.yml up -d db-prod server-prod client-prod'
                }
                echo "Produccion actualizada. Verifica en: http://localhost:8082"
            }
        }
    }

    post {
        success {
            echo "CI/CD completado con exito."
        }
        failure {
            echo "CI/CD fallo. Revisar los logs del build."
        }
        always {
            echo "Estado de los contenedores:"
            sh 'docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}" || true'
        }
    }
}
