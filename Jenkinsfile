pipeline {
    agent any

    environment {
        APP_NAME = "ek-boti-2-roti"
        APP_SERVER = "3.81.124.120"
        SSH_KEY = "/var/lib/jenkins/.ssh/id_ed25519"

        APP_BASE = "/var/www/ek-boti-2-roti"
        CURRENT_LINK = "/var/www/ek-boti-2-roti/current"

        PROD_PORT = "4200"
        TEMP_PORT_START = "14200"
        TEMP_PORT_END = "14300"

        HEALTH_ENDPOINT = "/"

        SONAR_PROJECT_KEY = "ek-boti-2-roti"
        SONAR_PROJECT_NAME = "ek-boti-2-roti"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        githubPush()
    }

    stages {

        stage('Clean Workspace') {
            steps {
                cleanWs()
            }
        }

        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Detect Branch') {
            steps {
                sh '''
                    set -e

                    CURRENT_BRANCH="${BRANCH_NAME:-${GIT_BRANCH#origin/}}"
                    CURRENT_BRANCH="${CURRENT_BRANCH#refs/heads/}"
                    CURRENT_BRANCH="${CURRENT_BRANCH#refs/remotes/origin/}"
                    CURRENT_BRANCH="${CURRENT_BRANCH#origin/}"

                    echo "$CURRENT_BRANCH" > .current_branch

                    echo "Current Branch: $CURRENT_BRANCH"

                    if [ "$CURRENT_BRANCH" = "main" ]; then
                        echo "Production deployment enabled"
                    else
                        echo "CI only mode"
                    fi
                '''
            }
        }

        stage('Code Validation') {
            steps {
                sh '''
                    set -e

                    test -f index.html
                    test -f server.js

                    node -c server.js

                    echo "Validation successful"
                '''
            }
        }

        stage('SonarQube Scan') {
            steps {
                withSonarQubeEnv('sonarqube') {
                    sh '''
                        set -e

                        sonar-scanner \
                          -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                          -Dsonar.projectName=${SONAR_PROJECT_NAME} \
                          -Dsonar.sources=. \
                          -Dsonar.exclusions=node_modules/**,.git/**,.scannerwork/**,img/**,images/**,assets/**,**/*.min.js,**/*.min.css \
                          -Dsonar.host.url=$SONAR_HOST_URL
                    '''
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Prepare Release') {

            when {
                expression {
                    return sh(script: "cat .current_branch", returnStdout: true).trim() == "main"
                }
            }

            steps {
                sh '''
                    set -e

                    RELEASE_ID="$(date +%Y%m%d%H%M%S)-${BUILD_NUMBER}"

                    echo "$RELEASE_ID" > .release_id

                    rsync -az --delete \
                      --exclude '.git' \
                      --exclude '.scannerwork' \
                      --exclude 'node_modules' \
                      -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
                      ./ ec2-user@${APP_SERVER}:/tmp/${APP_NAME}-release-${RELEASE_ID}/

                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        set -e

                        RELEASE_DIR='${APP_BASE}/releases/${RELEASE_ID}'

                        mkdir -p \\$RELEASE_DIR

                        rsync -az --delete \
                        /tmp/${APP_NAME}-release-${RELEASE_ID}/ \
                        \\$RELEASE_DIR/

                        cd \\$RELEASE_DIR

                        node -c server.js

                        echo 'Release prepared successfully'
                    "
                '''
            }
        }

        stage('Temporary Smoke Test') {

            when {
                expression {
                    return sh(script: "cat .current_branch", returnStdout: true).trim() == "main"
                }
            }

            steps {
                sh '''
                    set -e

                    RELEASE_ID="$(cat .release_id)"

                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        set -e

                        RELEASE_DIR='${APP_BASE}/releases/${RELEASE_ID}'

                        FREE_PORT=''

                        for PORT in \\$(seq ${TEMP_PORT_START} ${TEMP_PORT_END}); do
                            if ! ss -tuln | grep -q ':\\$PORT '; then
                                FREE_PORT=\\$PORT
                                break
                            fi
                        done

                        if [ -z \\$FREE_PORT ]; then
                            echo 'No free port found'
                            exit 1
                        fi

                        rm -f /tmp/${APP_NAME}-precheck.pid
                        rm -f /tmp/${APP_NAME}-precheck.log

                        cd \\$RELEASE_DIR

                        PORT=\\$FREE_PORT \
                        nohup node server.js \
                        > /tmp/${APP_NAME}-precheck.log 2>&1 &

                        echo \\$! > /tmp/${APP_NAME}-precheck.pid

                        for i in {1..24}; do

                            if curl -fsS http://127.0.0.1:\\$FREE_PORT${HEALTH_ENDPOINT} >/dev/null; then

                                echo 'Smoke test passed'

                                kill \\$(cat /tmp/${APP_NAME}-precheck.pid) 2>/dev/null || true

                                rm -f /tmp/${APP_NAME}-precheck.pid

                                exit 0
                            fi

                            echo "Retry \\$i/24"

                            sleep 5
                        done

                        echo 'Smoke test failed'

                        cat /tmp/${APP_NAME}-precheck.log || true

                        kill \\$(cat /tmp/${APP_NAME}-precheck.pid) 2>/dev/null || true

                        rm -f /tmp/${APP_NAME}-precheck.pid

                        exit 1
                    "
                '''
            }
        }

        stage('Deploy Production') {

            when {
                expression {
                    return sh(script: "cat .current_branch", returnStdout: true).trim() == "main"
                }
            }

            steps {
                sh '''
                    set -e

                    RELEASE_ID="$(cat .release_id)"

                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        set -e

                        RELEASE_DIR='${APP_BASE}/releases/${RELEASE_ID}'

                        PREV_TARGET=\\$(readlink -f ${CURRENT_LINK} || true)

                        if [ ! -d \\$RELEASE_DIR ]; then
                            echo 'Release missing'
                            exit 1
                        fi

                        ln -sfn \\$RELEASE_DIR ${CURRENT_LINK}

                        sudo systemctl daemon-reload
                        sudo systemctl restart ek-boti

                        for i in {1..24}; do

                            if curl -fsS http://127.0.0.1:${PROD_PORT}${HEALTH_ENDPOINT} >/dev/null; then
                                echo 'Production deployment successful'
                                exit 0
                            fi

                            echo "Health retry \\$i/24"

                            sleep 5
                        done

                        echo 'Deployment failed. Rolling back.'

                        if [ -n "\\$PREV_TARGET" ] && [ -d "\\$PREV_TARGET" ]; then

                            ln -sfn \\$PREV_TARGET ${CURRENT_LINK}

                            sudo systemctl restart ek-boti

                            echo 'Rollback successful'
                        fi

                        exit 1
                    "
                '''
            }
        }

        stage('Post Deployment Verification') {

            when {
                expression {
                    return sh(script: "cat .current_branch", returnStdout: true).trim() == "main"
                }
            }

            steps {
                sh '''
                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        set -e

                        sudo systemctl is-active --quiet ek-boti

                        ss -tulnp | grep ':${PROD_PORT}'

                        curl -fsS http://127.0.0.1:${PROD_PORT}${HEALTH_ENDPOINT} >/dev/null

                        echo 'Post deployment verification passed'
                    "
                '''
            }
        }

        stage('Cleanup Old Releases') {

            when {
                expression {
                    return sh(script: "cat .current_branch", returnStdout: true).trim() == "main"
                }
            }

            steps {
                sh '''
                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        ls -dt ${APP_BASE}/releases/* 2>/dev/null | tail -n +6 | xargs -r rm -rf

                        rm -rf /tmp/${APP_NAME}-release-* || true
                    "
                '''
            }
        }
    }

    post {

        always {
            sh '''
                CURRENT_BRANCH="${BRANCH_NAME:-${GIT_BRANCH#origin/}}"

                CURRENT_BRANCH="${CURRENT_BRANCH#refs/heads/}"
                CURRENT_BRANCH="${CURRENT_BRANCH#refs/remotes/origin/}"
                CURRENT_BRANCH="${CURRENT_BRANCH#origin/}"

                if [ "$CURRENT_BRANCH" = "main" ]; then

                    ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ec2-user@${APP_SERVER} "

                        if [ -f /tmp/${APP_NAME}-precheck.pid ]; then

                            kill \\$(cat /tmp/${APP_NAME}-precheck.pid) 2>/dev/null || true

                            rm -f /tmp/${APP_NAME}-precheck.pid
                        fi

                        rm -f /tmp/${APP_NAME}-precheck.log || true
                    "
                fi
            '''
        }

        success {
            echo "Pipeline SUCCESS"
        }

        failure {
            echo "Pipeline FAILED"
        }
    }
}
