# Generated manually for insurer network + TIC ingest metadata

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0005_merge_20260418_2130"),
    ]

    operations = [
        migrations.CreateModel(
            name="InsurerNetworkNpi",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("insurer_slug", models.CharField(db_index=True, max_length=32)),
                ("npi", models.CharField(db_index=True, max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="NetworkDatasetVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("git_commit", models.CharField(blank=True, max_length=64)),
                ("notes", models.TextField(blank=True)),
                ("counts_by_insurer", models.JSONField(default=dict)),
            ],
        ),
        migrations.CreateModel(
            name="TicSourceFile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("insurer_slug", models.CharField(db_index=True, max_length=32)),
                ("file_url", models.TextField()),
                ("sha256_hex", models.CharField(db_index=True, max_length=64)),
                ("npi_count", models.PositiveIntegerField(default=0)),
                ("processed_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name="insurernetworknpi",
            constraint=models.UniqueConstraint(
                fields=("insurer_slug", "npi"),
                name="api_insurernetworknpi_insurer_npi_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="ticsourcefile",
            constraint=models.UniqueConstraint(
                fields=("insurer_slug", "file_url", "sha256_hex"),
                name="api_ticsourcefile_insurer_url_hash_uniq",
            ),
        ),
    ]
