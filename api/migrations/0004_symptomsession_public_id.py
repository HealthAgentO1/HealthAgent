import uuid

from django.db import migrations, models


def fill_public_ids(apps, schema_editor):
    SymptomSession = apps.get_model("api", "SymptomSession")
    for row in SymptomSession.objects.filter(public_id__isnull=True):
        row.public_id = uuid.uuid4()
        row.save(update_fields=["public_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_symptomsession_updated_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="symptomsession",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.RunPython(fill_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="symptomsession",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
