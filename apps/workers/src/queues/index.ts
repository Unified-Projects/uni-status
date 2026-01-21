import { Queue } from "bullmq";
import { connection, queuePrefix } from "../lib/redis";
import { QUEUE_NAMES } from "@uni-status/shared/constants";

const queueOpts = { connection, prefix: queuePrefix };

export function createQueues() {
  const queues = {
    httpCheck: new Queue(QUEUE_NAMES.MONITOR_HTTP, queueOpts),
    dnsCheck: new Queue(QUEUE_NAMES.MONITOR_DNS, queueOpts),
    sslCheck: new Queue(QUEUE_NAMES.MONITOR_SSL, queueOpts),
    tcpCheck: new Queue(QUEUE_NAMES.MONITOR_TCP, queueOpts),
    pingCheck: new Queue(QUEUE_NAMES.MONITOR_PING, queueOpts),
    heartbeatCheck: new Queue(QUEUE_NAMES.MONITOR_HEARTBEAT, queueOpts),
    postgresCheck: new Queue(QUEUE_NAMES.MONITOR_DATABASE_POSTGRES, queueOpts),
    mysqlCheck: new Queue(QUEUE_NAMES.MONITOR_DATABASE_MYSQL, queueOpts),
    mongodbCheck: new Queue(QUEUE_NAMES.MONITOR_DATABASE_MONGODB, queueOpts),
    redisCheck: new Queue(QUEUE_NAMES.MONITOR_DATABASE_REDIS, queueOpts),
    elasticsearchCheck: new Queue(QUEUE_NAMES.MONITOR_DATABASE_ELASTICSEARCH, queueOpts),
    grpcCheck: new Queue(QUEUE_NAMES.MONITOR_GRPC, queueOpts),
    websocketCheck: new Queue(QUEUE_NAMES.MONITOR_WEBSOCKET, queueOpts),
    smtpCheck: new Queue(QUEUE_NAMES.MONITOR_SMTP, queueOpts),
    imapCheck: new Queue(QUEUE_NAMES.MONITOR_IMAP, queueOpts),
    pop3Check: new Queue(QUEUE_NAMES.MONITOR_POP3, queueOpts),
    sshCheck: new Queue(QUEUE_NAMES.MONITOR_SSH, queueOpts),
    ldapCheck: new Queue(QUEUE_NAMES.MONITOR_LDAP, queueOpts),
    rdpCheck: new Queue(QUEUE_NAMES.MONITOR_RDP, queueOpts),
    mqttCheck: new Queue(QUEUE_NAMES.MONITOR_MQTT, queueOpts),
    amqpCheck: new Queue(QUEUE_NAMES.MONITOR_AMQP, queueOpts),
    tracerouteCheck: new Queue(QUEUE_NAMES.MONITOR_TRACEROUTE, queueOpts),
    emailAuthCheck: new Queue(QUEUE_NAMES.MONITOR_EMAIL_AUTH, queueOpts),
    prometheusBlackboxCheck: new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_BLACKBOX, queueOpts),
    prometheusPromqlCheck: new Queue(QUEUE_NAMES.MONITOR_PROMETHEUS_PROMQL, queueOpts),
    certificateTransparencyCheck: new Queue(QUEUE_NAMES.MONITOR_CERTIFICATE_TRANSPARENCY, queueOpts),
    aggregateCheck: new Queue(QUEUE_NAMES.MONITOR_AGGREGATE, queueOpts),

    emailNotify: new Queue(QUEUE_NAMES.NOTIFY_EMAIL, queueOpts),
    slackNotify: new Queue(QUEUE_NAMES.NOTIFY_SLACK, queueOpts),
    discordNotify: new Queue(QUEUE_NAMES.NOTIFY_DISCORD, queueOpts),
    webhookNotify: new Queue(QUEUE_NAMES.NOTIFY_WEBHOOK, queueOpts),
    ircNotify: new Queue(QUEUE_NAMES.NOTIFY_IRC, queueOpts),
    twitterNotify: new Queue(QUEUE_NAMES.NOTIFY_TWITTER, queueOpts),
    teamsNotify: new Queue(QUEUE_NAMES.NOTIFY_TEAMS, queueOpts),
    pagerDutyNotify: new Queue(QUEUE_NAMES.NOTIFY_PAGERDUTY, queueOpts),
    smsNotify: new Queue(QUEUE_NAMES.NOTIFY_SMS, queueOpts),
    ntfyNotify: new Queue(QUEUE_NAMES.NOTIFY_NTFY, queueOpts),
    googleChatNotify: new Queue(QUEUE_NAMES.NOTIFY_GOOGLE_CHAT, queueOpts),
    componentSubscriberNotify: new Queue(QUEUE_NAMES.NOTIFY_COMPONENT_SUBSCRIBERS, queueOpts),
    eventSubscriberNotify: new Queue(QUEUE_NAMES.NOTIFY_EVENT_SUBSCRIBER, queueOpts),

    subscriberNotify: new Queue(QUEUE_NAMES.NOTIFY_SUBSCRIBER, queueOpts),

    aggregate: new Queue(QUEUE_NAMES.ANALYTICS_AGGREGATE, queueOpts),
    dailyAggregate: new Queue(QUEUE_NAMES.ANALYTICS_DAILY_AGGREGATE, queueOpts),

    cleanup: new Queue(QUEUE_NAMES.CLEANUP_RESULTS, queueOpts),

    sloCalculate: new Queue(QUEUE_NAMES.SLO_CALCULATE, queueOpts),
    sloAlert: new Queue(QUEUE_NAMES.SLO_ALERT, queueOpts),
    deploymentCorrelate: new Queue(QUEUE_NAMES.DEPLOYMENT_CORRELATE, queueOpts),
    reportGenerate: new Queue(QUEUE_NAMES.REPORT_GENERATE, queueOpts),
    probeJobDispatch: new Queue(QUEUE_NAMES.PROBE_JOB_DISPATCH, queueOpts),
    probeResultProcess: new Queue(QUEUE_NAMES.PROBE_RESULT_PROCESS, queueOpts),
    alertEvaluate: new Queue(QUEUE_NAMES.ALERT_EVALUATE, queueOpts),
    alertEscalation: new Queue(QUEUE_NAMES.ALERT_ESCALATION, queueOpts),
  };

  return queues;
}

export type Queues = ReturnType<typeof createQueues>;
